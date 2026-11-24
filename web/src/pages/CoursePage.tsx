import {
  ArrowRight,
  BookOpenCheck,
  Calculator,
  CircleDashed,
  ClipboardCheck,
  FileSpreadsheet,
  FlaskConical,
  GraduationCap,
  Info,
  ShieldCheck,
} from "lucide-react";

import { PageHeader } from "../components/ui/PageHeader";
import {
  AVAILABLE_COURSE_SESSION_IDS,
  COURSE_SESSION_ONE_ID,
  COURSE_SESSION_SO2_ID,
  courseSessions,
  getCourseSession,
} from "../lib/course";

const availableCount = String(AVAILABLE_COURSE_SESSION_IDS.length).padStart(2, "0");

const batchNotes = [
  {
    icon: ShieldCheck,
    title: "实验一与已有档案保持原样",
    text: "悬浮固体与浊度的双表页面继续可用；原 30 条实验档案、数据分析页和既有入口不改。",
  },
  {
    icon: ClipboardCheck,
    title: "COD 与 BOD₅ 只录原始字段",
    text: "样品号、日期、读数、单位和记录编号手填保存，只做字段校验；课程浓度和正式结论等待讲义确认。",
  },
  {
    icon: Calculator,
    title: "SO₂ 只做曲线和样品计算",
    text: "六个标准点拟合后计算样品 C；第 29 页标准溶液标定不纳入，V₀ 由学生填写，不预填 20 L。",
  },
  {
    icon: BookOpenCheck,
    title: "BOD₅ 两课次共用一份草稿",
    text: "第 6 和第 7 课次打开同一份本地样品记录，首段、次段分别显示是否齐全，缺失不按 0 处理。",
  },
  {
    icon: FileSpreadsheet,
    title: "第 2、4、8 课次共用原始记录表",
    text: "甲醛、挥发酚与舒适度逐行保存样品或点位、测量项目、读数、单位；计算公式和合格判定等待讲义确认。",
  },
];

export function CoursePage({ requestedSession = "" }: { requestedSession?: string }) {
  const requested = requestedSession ? getCourseSession(requestedSession) : null;
  const unavailableRequest =
    requested &&
    !(AVAILABLE_COURSE_SESSION_IDS as readonly string[]).includes(requested.id)
      ? requested
      : null;

  return (
    <div className="page-frame course-page">
      <PageHeader
        eyebrow="环境监测课程 · 八个课次"
        title="从课程实验进入可核对的本地记录"
        description="八个课次都已接通本地录入、草稿恢复和 CSV 导出：实验一保留双表计算，COD、BOD₅、甲醛、挥发酚与舒适度保存原始字段，SO₂ 另做六点标准曲线与样品浓度计算。"
        actions={
          <>
            <a className="button button--primary" href={`#/course?session=${COURSE_SESSION_ONE_ID}`}>
              <FlaskConical size={14} strokeWidth={1.5} aria-hidden="true" />
              进入实验一
            </a>
            <a className="button button--secondary" href={`#/course?session=${COURSE_SESSION_SO2_ID}`}>
              <Calculator size={14} strokeWidth={1.5} aria-hidden="true" />
              进入 SO₂ 测定
            </a>
            <a className="button button--quiet" href="#/experiments">
              查看 30 条实验档案
            </a>
          </>
        }
      />

      {unavailableRequest && (
        <div className="course-request-alert" role="status">
          <Info size={15} strokeWidth={1.5} aria-hidden="true" />
          <p>
            第 {unavailableRequest.order} 课次「{unavailableRequest.title}」的入口暂未接通。
            请返回课程总览，从当前 8 个可用课次中重新选择。
          </p>
        </div>
      )}

      <section className="course-brief" aria-labelledby="course-brief-title">
        <span className="course-brief__icon" aria-hidden="true">
          <GraduationCap size={22} strokeWidth={1.5} />
        </span>
        <div className="course-brief__copy">
          <h2 id="course-brief-title">本轮仍是本地验收版</h2>
          <p>
            课程入口、实验一、COD 原始记录、SO₂ 曲线与样品计算、BOD₅ 两段记录，
            以及第 2、4、8 课次的共用原始记录表都已接通，
            但不会发布新版本，也不会改动线上站点权限。所有录入内容只保存在当前浏览器，
            可随时导出 CSV；实验一另可导出 Markdown 摘要。
          </p>
        </div>
        <span className="status-chip status-chip--positive">
          <span className="status-chip__dot" aria-hidden="true" />
          {AVAILABLE_COURSE_SESSION_IDS.length} 个课次入口可用
        </span>
      </section>

      <section className="course-map" aria-labelledby="course-map-title">
        <div className="course-section-head">
          <div>
            <h2 id="course-map-title">八个课次</h2>
            <p>
              实验一提供双表计算样板；COD、BOD₅、甲醛、挥发酚与舒适度保存原始字段，
              SO₂ 另做六点标准曲线与样品浓度计算。8 个课次均可进入，录入内容分别保存在当前浏览器。
            </p>
          </div>
          <span className="course-map__count">{availableCount} / 08 已开放</span>
        </div>

        <ol className="course-session-list">
          {courseSessions.map((session) => {
            const available = session.status === "available";
            const sharedBod5 =
              session.id === "6"
                ? "与第 7 课次共用同一份本地样品记录"
                : session.id === "7"
                  ? "与第 6 课次共用同一份本地样品记录"
                  : "";
            return (
              <li
                key={session.id}
                className={`course-session ${available ? "course-session--available" : ""}`}
              >
                <span className="course-session__order" aria-hidden="true">
                  {String(session.order).padStart(2, "0")}
                </span>
                <div className="course-session__body">
                  <div className="course-session__head">
                    <h3>{session.title}</h3>
                    <span
                      className={`status-chip ${available ? "status-chip--positive" : "status-chip--neutral"}`}
                    >
                      <span className="status-chip__dot" aria-hidden="true" />
                      {available ? "本轮可用" : "后续批次"}
                    </span>
                  </div>
                  <p className="course-session__method">{session.method}</p>
                  <p className="course-session__focus">{session.focus}</p>
                  {sharedBod5 && <p className="course-session__shared">{sharedBod5}</p>}
                  <div className="course-session__actions">
                    {available && (
                      <a
                        className="button button--primary button--small"
                        href={`#/course?session=${session.id}`}
                      >
                        {session.entryLabel ?? "进入实验一"}
                        <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
                      </a>
                    )}
                    {session.archive && (
                      <a
                        className="button button--quiet button--small"
                        href={`#/experiments?id=${session.archive.id}`}
                        title={session.archive.label}
                      >
                        查看已有档案
                      </a>
                    )}
                    {!available && !session.archive && (
                      <span className="course-session__pending">
                        <CircleDashed size={13} strokeWidth={1.5} aria-hidden="true" />
                        等待后续批次提供录入表
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="course-boundary" aria-labelledby="course-boundary-title">
        <div className="course-section-head">
          <div>
            <h2 id="course-boundary-title">本轮边界</h2>
            <p>这些约束会直接反映在录入、计算和导出结果中。</p>
          </div>
        </div>
        <div className="course-boundary__grid">
          {batchNotes.map((note) => {
            const Icon = note.icon;
            return (
              <div key={note.title} className="course-boundary__item">
                <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
                <h3>{note.title}</h3>
                <p>{note.text}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}