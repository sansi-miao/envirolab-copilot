import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import {
  formatNumber,
  type AnalysisPoint,
  type ChartType,
  type LinearFit,
} from "../../lib/analysis";

const FONT_STACK = '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const ACCENT = "#086378";
const ACCENT_SOFT = "rgba(8, 99, 120, 0.12)";
const JADE = "#247c69";
const INK = "#31505c";
const INK_MUTED = "#5d727c";
const GRID = "rgba(11, 40, 53, 0.07)";
const AXIS = "rgba(11, 40, 53, 0.18)";

interface ResearchChartProps {
  svgId: string;
  points: AnalysisPoint[];
  chartType: ChartType;
  title: string;
  xName: string;
  yName: string;
  xUnit: string;
  yUnit: string;
  fit: LinearFit | null;
  numericX: boolean;
}

interface PositionedPoint extends AnalysisPoint {
  px: number;
  py: number;
  category: string;
}

function truncateLabel(value: string, maximum = 12) {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
}

function niceTicks(minimum: number, maximum: number, target = 5) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return [];
  if (minimum === maximum) return [minimum];
  const span = maximum - minimum;
  const rough = span / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  const step = niceFraction * power;
  const start = Math.ceil(minimum / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = start; value <= maximum + step * 0.001; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}

function axisNumber(value: number) {
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute >= 1_000_000 || absolute < 0.001)) {
    return value.toExponential(1);
  }
  return new Intl.NumberFormat("zh-CN", { maximumSignificantDigits: 4 }).format(value);
}

export function ResearchChart({
  svgId,
  points,
  chartType,
  title,
  xName,
  yName,
  xUnit,
  yUnit,
  fit,
  numericX,
}: ResearchChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hovered, setHovered] = useState<PositionedPoint | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(Math.round(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const height = width < 520 ? 310 : 380;
  const margin = {
    top: 58,
    right: 22,
    bottom: 62,
    left: width < 520 ? 54 : 68,
  };
  const plotWidth = Math.max(40, width - margin.left - margin.right);
  const plotHeight = Math.max(40, height - margin.top - margin.bottom);

  const chart = useMemo(() => {
    if (points.length === 0) return null;

    if (numericX) {
      const sorted =
        chartType === "line"
          ? [...points].sort((a, b) => (a.x as number) - (b.x as number))
          : points;
      const xValues = sorted.map((point) => point.x as number);
      const yValues = sorted.map((point) => point.y);
      const rawXMin = Math.min(...xValues);
      const rawXMax = Math.max(...xValues);
      const xPadding = rawXMin === rawXMax ? Math.max(1, Math.abs(rawXMin) * 0.1) : (rawXMax - rawXMin) * 0.04;
      const xMin = rawXMin - xPadding;
      const xMax = rawXMax + xPadding;

      let rawYMin = Math.min(...yValues);
      let rawYMax = Math.max(...yValues);
      if (chartType === "bar" || (rawYMin > 0 && rawYMin / Math.max(rawYMax, 1e-9) < 0.35)) {
        rawYMin = Math.min(0, rawYMin);
      }
      if (rawYMin === rawYMax) {
        const delta = Math.max(1, Math.abs(rawYMin) * 0.1);
        rawYMin -= delta;
        rawYMax += delta;
      }
      const yPadding = (rawYMax - rawYMin) * 0.07;
      const yMin = chartType === "bar" ? Math.min(0, rawYMin) : rawYMin - yPadding;
      const yMax = rawYMax + yPadding;

      const scaleX = (value: number) => margin.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
      const scaleY = (value: number) => margin.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;

      const positioned: PositionedPoint[] = sorted.map((point) => ({
        ...point,
        px: scaleX(point.x as number),
        py: scaleY(point.y),
        category: point.xLabel,
      }));

      const barWidth = chartType === "bar" ? Math.max(3, Math.min(30, (plotWidth / positioned.length) * 0.58)) : 0;

      return {
        positioned,
        xTicks: niceTicks(xMin, xMax).map((value) => ({
          position: scaleX(value),
          label: axisNumber(value),
        })),
        yTicks: niceTicks(yMin, yMax).map((value) => ({
          position: scaleY(value),
          label: axisNumber(value),
        })),
        zeroY: scaleY(0),
        domainMin: yMin,
        domainMax: yMax,
        scaleX,
        scaleY,
        barWidth,
      };
    }

    const bandWidth = plotWidth / Math.max(1, points.length);
    const positioned: PositionedPoint[] = points.map((point, index) => ({
      ...point,
      px: margin.left + bandWidth * (index + 0.5),
      py: 0,
      category: point.xLabel,
    }));

    const yValues = points.map((point) => point.y);
    let rawYMin = Math.min(...yValues);
    let rawYMax = Math.max(...yValues);
    if (chartType === "bar") rawYMin = Math.min(0, rawYMin);
    if (rawYMin === rawYMax) {
      const delta = Math.max(1, Math.abs(rawYMin) * 0.1);
      rawYMin -= delta;
      rawYMax += delta;
    }
    const yPadding = (rawYMax - rawYMin) * 0.07;
    const yMin = chartType === "bar" ? Math.min(0, rawYMin) : rawYMin - yPadding;
    const yMax = rawYMax + yPadding;
    const scaleY = (value: number) => margin.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;

    for (const point of positioned) point.py = scaleY(point.y);

    const labelEvery = Math.max(1, Math.ceil(positioned.length / (width < 520 ? 3 : 8)));
    const labelLength = width < 520 ? 7 : 12;
    const xTicks = positioned
      .map((point, index) => ({
        position: point.px,
        label: truncateLabel(point.category, labelLength),
        index,
      }))
      .filter((tick) => tick.index % labelEvery === 0 || tick.index === positioned.length - 1)
      .map(({ position, label }) => ({ position, label }));

    const barWidth = chartType === "bar"
      ? Math.max(4, Math.min(34, bandWidth * 0.6))
      : 0;

    return {
      positioned,
      xTicks,
      yTicks: niceTicks(yMin, yMax).map((value) => ({
        position: scaleY(value),
        label: axisNumber(value),
      })),
      zeroY: scaleY(0),
      domainMin: yMin,
      domainMax: yMax,
      scaleX: null,
      scaleY,
      barWidth,
    };
  }, [points, chartType, numericX, margin.left, margin.top, plotHeight, plotWidth, width]);

  const displayPoints = useMemo(() => {
    if (!chart?.positioned) return [];
    if (chart.positioned.length <= 1800) return chart.positioned;
    const step = Math.ceil(chart.positioned.length / 1800);
    return chart.positioned.filter((_, index) => index % step === 0 || index === chart.positioned.length - 1);
  }, [chart]);

  const linePath = useMemo(() => {
    if (!chart || chartType !== "line" || numericX) return "";
    return chart.positioned
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.px.toFixed(2)} ${point.py.toFixed(2)}`)
      .join(" ");
  }, [chart, chartType, numericX]);

  const numericLinePath = useMemo(() => {
    if (!chart || chartType !== "line" || !numericX) return "";
    return chart.positioned
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.px.toFixed(2)} ${point.py.toFixed(2)}`)
      .join(" ");
  }, [chart, chartType, numericX]);

  const xLabel = xUnit ? `${xName}（${xUnit}）` : xName;
  const yLabel = yUnit ? `${yName}（${yUnit}）` : yName;
  const titleCharacters = Math.min(42, Math.max(10, Math.floor((width - margin.left - margin.right) / 14)));
  const chartTitle = truncateLabel(title || "实验数据图表", titleCharacters);

  function handlePointerMove(event: PointerEvent<SVGRectElement>) {
    if (!chart) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left + margin.left;
    const y = event.clientY - rect.top + margin.top;
    let nearest: PositionedPoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const point of displayPoints) {
      const distance =
        chartType === "scatter"
          ? Math.hypot(point.px - x, point.py - y)
          : Math.abs(point.px - x);
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }

    if (nearest && nearestDistance < (chartType === "scatter" ? 38 : 24)) {
      setHovered(nearest);
    } else {
      setHovered(null);
    }
  }

  const numericFitLine = useMemo(() => {
    if (!chart || !fit || chartType !== "scatter" || !chart.scaleX) return null;
    const xValues = points.map((point) => point.x as number);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    return {
      x1: chart.scaleX(xMin),
      y1: chart.scaleY(fit.slope * xMin + fit.intercept),
      x2: chart.scaleX(xMax),
      y2: chart.scaleY(fit.slope * xMax + fit.intercept),
    };
  }, [chart, fit, chartType, points]);

  return (
    <div ref={containerRef} className="research-chart">
      {!chart || chart.positioned.length === 0 ? (
        <div className="research-chart__empty">
          <p>当前列组合没有可绘制的数据点。</p>
          <p>请检查列选择，或回到原始数据补全数值。</p>
        </div>
      ) : (
        <>
          <svg
            id={svgId}
            xmlns="http://www.w3.org/2000/svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${chartTitle}。X 轴 ${xLabel}，Y 轴 ${yLabel}，共 ${points.length} 个数据点。`}
          >
            <rect width={width} height={height} fill="#ffffff" />
            <text x={margin.left} y={24} fill={INK} fontFamily={FONT_STACK} fontSize="13.5" fontWeight="600">
              {chartTitle}
            </text>
            <text
              x={width - margin.right}
              y={40}
              textAnchor="end"
              fill={INK_MUTED}
              fontFamily={FONT_STACK}
              fontSize="10"
            >
              n = {points.length}
              {fit ? ` · R² = ${formatNumber(fit.r2, 3)}` : ""}
            </text>

            {chart.yTicks.map((tick) => (
              <g key={`y-${tick.position}-${tick.label}`}>
                <line
                  x1={margin.left}
                  y1={tick.position}
                  x2={width - margin.right}
                  y2={tick.position}
                  stroke={GRID}
                  strokeWidth="1"
                />
                <text
                  x={margin.left - 9}
                  y={tick.position + 3.5}
                  textAnchor="end"
                  fill={INK_MUTED}
                  fontFamily={FONT_STACK}
                  fontSize="10"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            <line
              x1={margin.left}
              y1={margin.top + plotHeight}
              x2={width - margin.right}
              y2={margin.top + plotHeight}
              stroke={AXIS}
              strokeWidth="1"
            />
            <line
              x1={margin.left}
              y1={margin.top}
              x2={margin.left}
              y2={margin.top + plotHeight}
              stroke={AXIS}
              strokeWidth="1"
            />

            {chartType === "bar" && (
              <line
                x1={margin.left}
                y1={chart.zeroY}
                x2={width - margin.right}
                y2={chart.zeroY}
                stroke={AXIS}
                strokeWidth="1"
              />
            )}

            {chart.xTicks.map((tick) => (
              <g key={`x-${tick.position}-${tick.label}`}>
                <line
                  x1={tick.position}
                  y1={margin.top + plotHeight}
                  x2={tick.position}
                  y2={margin.top + plotHeight + 4}
                  stroke={AXIS}
                  strokeWidth="1"
                />
                <text
                  x={tick.position}
                  y={margin.top + plotHeight + 18}
                  textAnchor="middle"
                  fill={INK_MUTED}
                  fontFamily={FONT_STACK}
                  fontSize="10"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            <text
              x={margin.left + plotWidth / 2}
              y={height - 12}
              textAnchor="middle"
              fill={INK}
              fontFamily={FONT_STACK}
              fontSize="10.5"
            >
              {xLabel}
            </text>
            <text
              x={15}
              y={margin.top + plotHeight / 2}
              textAnchor="middle"
              transform={`rotate(-90 15 ${margin.top + plotHeight / 2})`}
              fill={INK}
              fontFamily={FONT_STACK}
              fontSize="10.5"
            >
              {yLabel}
            </text>

            {chartType === "bar" &&
              chart.positioned.map((point) => {
                const top = Math.min(point.py, chart.zeroY);
                const barHeight = Math.max(1, Math.abs(chart.zeroY - point.py));
                return (
                  <rect
                    key={`bar-${point.row}`}
                    x={point.px - chart.barWidth / 2}
                    y={top}
                    width={chart.barWidth}
                    height={barHeight}
                    rx="1.5"
                    fill={ACCENT}
                    opacity="0.82"
                  />
                );
              })}

            {chartType === "line" && (
              <path
                d={numericX ? numericLinePath : linePath}
                fill="none"
                stroke={ACCENT}
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {numericFitLine && (
              <line
                x1={numericFitLine.x1}
                y1={numericFitLine.y1}
                x2={numericFitLine.x2}
                y2={numericFitLine.y2}
                stroke={JADE}
                strokeWidth="1.4"
                strokeDasharray="5 4"
                opacity="0.8"
              />
            )}

            {chartType !== "bar" &&
              displayPoints.map((point) => (
                <circle
                  key={`point-${point.row}`}
                  cx={point.px}
                  cy={point.py}
                  r={chartType === "scatter" ? 3.2 : 2.6}
                  fill={ACCENT}
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  opacity={numericX ? 0.88 : 0.8}
                />
              ))}

            {hovered && (
              <g className="chart-hover-layer" pointerEvents="none">
                <line
                  x1={hovered.px}
                  y1={margin.top}
                  x2={hovered.px}
                  y2={margin.top + plotHeight}
                  stroke={ACCENT}
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.35"
                />
                <circle cx={hovered.px} cy={hovered.py} r="4.6" fill={ACCENT} stroke="#ffffff" strokeWidth="1.5" />
              </g>
            )}

            <rect
              x={margin.left}
              y={margin.top}
              width={plotWidth}
              height={plotHeight}
              fill="transparent"
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHovered(null)}
            />
          </svg>

          {hovered && (
            <div
              className="research-chart__tooltip"
              style={{
                left: Math.min(Math.max(hovered.px, 92), width - 92),
                top: Math.max(12, hovered.py - 14),
              }}
            >
              <p className="research-chart__tooltip-row">
                <span>{xLabel}</span>
                <strong>{hovered.xLabel}</strong>
              </p>
              <p className="research-chart__tooltip-row">
                <span>{yLabel}</span>
                <strong>{formatNumber(hovered.y, 6)}</strong>
              </p>
              <p className="research-chart__tooltip-note">原始数据第 {hovered.row} 行</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
