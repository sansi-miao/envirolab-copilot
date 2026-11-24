export type StandardIssueLevel = "error" | "warning";

export interface StandardCalculationIssue {
  level: StandardIssueLevel;
  message: string;
}

export interface StandardCalculation {
  value: number | null;
  issues: StandardCalculationIssue[];
}

export interface CodStandardInput {
  fasConcentration: number;
  blankTitrationMl: number;
  sampleTitrationMl: number;
  refluxSampleVolumeMl: number;
  dilutionFactor?: number;
}

export type Bod5StandardMode = "undiluted" | "undilutedSeeded" | "diluted";

export interface Bod5StandardInput {
  sampleBefore: number;
  sampleAfter: number;
  blankBefore?: number;
  blankAfter?: number;
  f1?: number;
  f2?: number;
}

export interface StandardField {
  symbol: string;
  name: string;
  unit: string;
  detail: string;
}

export interface StandardFormula {
  id: string;
  code: string;
  name: string;
  expression: string;
  applicable: string;
  notes: string[];
}

export interface StandardLimit {
  label: string;
  value: string;
  detail?: string;
}

export interface StandardExampleRow {
  label: string;
  symbol: string;
  value: string;
  unit: string;
}

export interface StandardExample {
  id: string;
  code: string;
  title: string;
  note: string;
  rows: StandardExampleRow[];
  substitution: string;
  resultValue: number | null;
  resultDisplay: string;
  resultUnit: string;
}

export interface StandardSource {
  id: string;
  kind: "official" | "teaching";
  label: string;
  publisher: string;
  date: string;
  pageUrl: string;
  pdfUrl?: string;
  note: string;
}

export interface PublicStandard {
  id: "cod" | "bod5";
  code: string;
  title: string;
  method: string;
  issuer: string;
  issuedAt: string;
  effectiveAt: string;
  summary: string;
  scope: string[];
  limits: StandardLimit[];
  fields: StandardField[];
  formulas: StandardFormula[];
  conditions: string[];
  qualityControl?: StandardLimit[];
  dilutionTable?: Array<{ expected: string; multiple: string }>;
  dilutionNote?: string;
  reporting: string[];
  sources: StandardSource[];
  examples: StandardExample[];
  exampleNote: string;
  classroomNote: string;
}

function errorIssue(message: string): StandardCalculationIssue {
  return { level: "error", message };
}

function warningIssue(message: string): StandardCalculationIssue {
  return { level: "warning", message };
}

function hasErrors(issues: StandardCalculationIssue[]) {
  return issues.some((issue) => issue.level === "error");
}

export function calculateCodStandard(input: CodStandardInput): StandardCalculation {
  const dilutionFactor = input.dilutionFactor ?? 1;
  const values = [
    input.fasConcentration,
    input.blankTitrationMl,
    input.sampleTitrationMl,
    input.refluxSampleVolumeMl,
    dilutionFactor,
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    return { value: null, issues: [errorIssue("COD 计算输入必须是有效数字。")] };
  }

  const issues: StandardCalculationIssue[] = [];
  if (input.fasConcentration <= 0) {
    issues.push(errorIssue("硫酸亚铁铵浓度必须大于 0 mol/L。"));
  }
  if (input.blankTitrationMl < 0) {
    issues.push(errorIssue("空白滴定体积不能为负数。"));
  }
  if (input.sampleTitrationMl < 0) {
    issues.push(errorIssue("样品滴定体积不能为负数。"));
  }
  if (input.refluxSampleVolumeMl <= 0) {
    issues.push(errorIssue("回流所取水样体积必须大于 0 mL。"));
  }
  if (dilutionFactor <= 0) {
    issues.push(errorIssue("稀释倍数必须大于 0；未稀释时填写 1。"));
  }
  if (hasErrors(issues)) return { value: null, issues };

  if (input.blankTitrationMl < input.sampleTitrationMl) {
    issues.push(
      warningIssue("空白滴定体积小于样品滴定体积，结果将为负值，应核对 V₀、V₁ 和稀释步骤。"),
    );
  }

  const value =
    (input.fasConcentration *
      (input.blankTitrationMl - input.sampleTitrationMl) *
      8000) /
    input.refluxSampleVolumeMl *
    dilutionFactor;

  if (value > 700) {
    issues.push(
      warningIssue("计算结果超过未稀释测定上限 700 mg/L，应按标准稀释后重新测定。"),
    );
  }

  return { value, issues };
}

export function calculateBod5Standard(
  mode: Bod5StandardMode,
  input: Bod5StandardInput,
): StandardCalculation {
  const issues: StandardCalculationIssue[] = [];
  if (![input.sampleBefore, input.sampleAfter].every((value) => Number.isFinite(value))) {
    return { value: null, issues: [errorIssue("BOD₅ 计算输入必须是有效数字。")] };
  }
  if (input.sampleBefore < 0 || input.sampleAfter < 0) {
    issues.push(errorIssue("溶解氧不能为负数。"));
  }

  const needsBlank = mode !== "undiluted";
  const blankBefore = input.blankBefore;
  const blankAfter = input.blankAfter;
  if (needsBlank) {
    if (
      blankBefore === undefined ||
      blankAfter === undefined ||
      !Number.isFinite(blankBefore) ||
      !Number.isFinite(blankAfter)
    ) {
      issues.push(errorIssue("接种或稀释培养必须同时填写空白培养前后的溶解氧。"));
    } else if (blankBefore < 0 || blankAfter < 0) {
      issues.push(errorIssue("空白溶解氧不能为负数。"));
    }
  }

  const f1 = input.f1;
  const f2 = input.f2;
  if (mode === "diluted") {
    if (f1 === undefined || !Number.isFinite(f1)) {
      issues.push(errorIssue("稀释培养必须填写 f₁。"));
    } else if (f1 < 0 || f1 > 1) {
      issues.push(errorIssue("f₁ 必须在 0 到 1 之间。"));
    }
    if (f2 === undefined || !Number.isFinite(f2)) {
      issues.push(errorIssue("稀释培养必须填写 f₂。"));
    } else if (f2 <= 0 || f2 > 1) {
      issues.push(errorIssue("f₂ 必须大于 0 且不超过 1。"));
    }
  }
  if (hasErrors(issues)) return { value: null, issues };

  const sampleDepletion = input.sampleBefore - input.sampleAfter;
  if (sampleDepletion < 0) {
    issues.push(
      warningIssue("培养后样品溶解氧高于培养前，耗氧量为负值，应核对培养与测定记录。"),
    );
  }

  let blankDepletion = 0;
  if (needsBlank) {
    blankDepletion = (blankBefore as number) - (blankAfter as number);
    if (blankDepletion < 0) {
      issues.push(
        warningIssue("培养后空白溶解氧高于培养前，空白耗氧量为负值，应核对空白记录。"),
      );
    }
  }

  const f1Value = f1 ?? 0;
  let value: number;
  if (mode === "diluted") {
    value = (sampleDepletion - blankDepletion * f1Value) / (f2 as number);
  } else {
    value = sampleDepletion - blankDepletion;
  }

  if (value < 0) {
    issues.push(warningIssue("计算结果为负值，应复核样品、空白与稀释比例。"));
  }
  if ((mode === "undiluted" || mode === "undilutedSeeded") && value > 6) {
    issues.push(
      warningIssue("计算结果超过未稀释法上限 6 mg/L，应按标准稀释后重新测定。"),
    );
  }
  if (mode === "diluted" && value > 6000) {
    issues.push(
      warningIssue("计算结果超过稀释法上限 6000 mg/L，应调整稀释倍数后重新测定。"),
    );
  }

  return { value, issues };
}

const officialSources: StandardSource[] = [
  {
    id: "mee-hj828-2017",
    kind: "official",
    label: "HJ 828—2017《水质 化学需氧量的测定 重铬酸盐法》",
    publisher: "生态环境部",
    date: "2017-03-30 发布 · 2017-05-01 实施",
    pageUrl:
      "https://www.mee.gov.cn/ywgz/fgbz/bz/bzwb/jcffbz/201704/t20170410_409547.shtml",
    pdfUrl:
      "https://www.mee.gov.cn/ywgz/fgbz/bz/bzwb/jcffbz/201704/W020170606398873416325.pdf",
    note: "适用范围、检出限、氯化物限制、公式和结果表达以标准原文为准。",
  },
  {
    id: "mee-hj505-2009",
    kind: "official",
    label: "HJ 505—2009《水质 五日生化需氧量（BOD5）的测定 稀释与接种法》",
    publisher: "生态环境部",
    date: "2009-10-20 发布 · 2009-12-01 实施",
    pageUrl:
      "https://www.mee.gov.cn/ywgz/fgbz/bz/bzwb/jcffbz/200911/t20091106_181277.shtml",
    pdfUrl:
      "https://www.mee.gov.cn/ywgz/fgbz/bz/bzwb/jcffbz/200911/W020111114554083249173.pdf",
    note: "培养条件、稀释倍数、空白与质控判据以标准原文为准。",
  },
];

const teachingSources: StandardSource[] = [
  {
    id: "xatu-environmental-monitoring-syllabus",
    kind: "teaching",
    label: "《环境监测技术与理论》实验教学大纲",
    publisher: "西安工业大学材料工程实验教学中心",
    date: "页面发布 2012-03-22 · 大纲制定 2010-06-20",
    pageUrl: "https://clgc.xatu.edu.cn/info/10824/67626.htm",
    note: "实验三废水 COD 为 2 学时验证实验，采用重铬酸钾回流和硫酸亚铁铵回滴；实验四废水 BOD5 为 2 学时验证实验，采用 20±1 ℃ 五日培养并测量溶解氧。用于核对实验定位、课时和主要仪器，不替代标准原文。",
  },
  {
    id: "qust-environmental-monitoring-course",
    kind: "teaching",
    label: "《环境监测（山东联盟）》公开课程页",
    publisher: "青岛科技大学 · 国家高等教育智慧教育平台",
    date: "课程页更新 2026-11-21 · 开课时间 2026-07-21 至 2027-01-20",
    pageUrl: "https://www.chinaooc.com.cn/course/671ad51a16d8a05eedca4396",
    note: "公开目录含“1.14 化学需氧量及高锰酸盐指数的测定”和“1.15 BOD5 的测定”。用于核对高校课程章节；平台学习入口是否需登录以页面为准。",
  },
];

const codExampleInput: CodStandardInput = {
  fasConcentration: 0.1,
  blankTitrationMl: 24.5,
  sampleTitrationMl: 20.0,
  refluxSampleVolumeMl: 10.0,
  dilutionFactor: 1,
};
const codExampleResult = calculateCodStandard(codExampleInput);

const bodUndilutedInput: Bod5StandardInput = {
  sampleBefore: 8.0,
  sampleAfter: 3.0,
};
const bodUndilutedResult = calculateBod5Standard("undiluted", bodUndilutedInput);

const bodSeededInput: Bod5StandardInput = {
  sampleBefore: 8.0,
  sampleAfter: 3.0,
  blankBefore: 8.5,
  blankAfter: 8.0,
};
const bodSeededResult = calculateBod5Standard("undilutedSeeded", bodSeededInput);

const bodDilutedInput: Bod5StandardInput = {
  ...bodSeededInput,
  f1: 0.8,
  f2: 0.2,
};
const bodDilutedResult = calculateBod5Standard("diluted", bodDilutedInput);

function formatFixedOne(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

export const codPublicStandard: PublicStandard = {
  id: "cod",
  code: "HJ 828—2017",
  title: "水质 化学需氧量的测定 重铬酸盐法",
  method: "重铬酸盐回流滴定法",
  issuer: "中华人民共和国生态环境部",
  issuedAt: "2017-03-30",
  effectiveAt: "2017-05-01",
  summary:
    "在强酸和银盐催化下，用已知量重铬酸钾氧化水样中的可氧化物质；沸腾回流后以硫酸亚铁铵滴定剩余重铬酸钾。公开标准参考只用于方法核对，不参与本页课堂原始记录计算。",
  scope: [
    "适用于地表水、生活污水和工业废水中化学需氧量的测定。",
    "不适用于稀释后氯化物浓度大于 1000 mg/L 的水样。",
  ],
  limits: [
    { label: "检出限", value: "4 mg/L", detail: "10.0 mL 水样" },
    { label: "测定下限", value: "16 mg/L", detail: "10.0 mL 水样" },
    { label: "未稀释测定上限", value: "700 mg/L", detail: "超过 700 mg/L 应稀释后测定" },
  ],
  fields: [
    {
      symbol: "C",
      name: "硫酸亚铁铵标准溶液浓度",
      unit: "mol/L",
      detail: "临用前标定，计算时使用实际标定浓度。",
    },
    {
      symbol: "V₀",
      name: "空白滴定消耗体积",
      unit: "mL",
      detail: "以实验用水代替水样，按相同试剂和步骤测定。",
    },
    {
      symbol: "V₁",
      name: "样品滴定消耗体积",
      unit: "mL",
      detail: "终点颜色由黄色经蓝绿色变为红褐色。",
    },
    {
      symbol: "V₂",
      name: "回流所取水样体积",
      unit: "mL",
      detail: "标准采用 10.0 mL；按实际取样体积记录。",
    },
    {
      symbol: "f",
      name: "水样稀释倍数",
      unit: "无量纲",
      detail: "未稀释为 1；稀释测定时乘以实际稀释倍数。",
    },
    {
      symbol: "ρ",
      name: "化学需氧量（COD）",
      unit: "mg/L",
      detail: "结果小于 100 mg/L 保留整数；大于或等于 100 mg/L 保留三位有效数字。",
    },
  ],
  formulas: [
    {
      id: "cod-dichromate",
      code: "HJ 828—2017 结果计算",
      name: "重铬酸盐法 COD",
      expression: "ρ = C × (V₀ − V₁) × 8000 ÷ V₂ × f",
      applicable:
        "适用于重铬酸盐回流滴定体系；样品经稀释时，f 为实际稀释倍数。",
      notes: [
        "8000 为氧当量换算系数（按 1/4 O₂ 计）。",
        "V₀、V₁、V₂ 应使用相同体积单位（mL），C 为硫酸亚铁铵实际浓度（mol/L）。",
        "结果计算不等于质控合格；空白、平行样和稀释有效性仍需按标准与课程要求判断。",
      ],
    },
  ],
  conditions: [
    "标准取样体积为 10.0 mL，沸腾回流 2 h；冷却后用 45 mL 水冲洗冷凝管。",
    "硫酸汞与氯离子的质量比至少为 20:1，硫酸汞溶液加入量不超过 2 mL。",
    "加入 15 mL 硫酸银-硫酸溶液作为催化体系。",
    "样品用玻璃瓶采集，体积不少于 100 mL；硫酸酸化至 pH<2，4 ℃ 保存，保存时间不超过 5 d。",
    "硫酸汞、重铬酸钾和强酸具有毒性和腐蚀性，应在通风条件下操作，含汞废液单独收集。",
  ],
  reporting: [
    "结果小于 100 mg/L 时保留整数；大于或等于 100 mg/L 时保留三位有效数字。",
  ],
  sources: [...officialSources.filter((source) => source.id === "mee-hj828-2017"), ...teachingSources],
  examples: [
    {
      id: "cod-example",
      code: "结果计算示例",
      title: "重铬酸盐法滴定示例",
      note: "合成数据，只用于核对公式、单位和有效数字，不是课堂测量。",
      rows: [
        { label: "硫酸亚铁铵浓度", symbol: "C", value: "0.1000", unit: "mol/L" },
        { label: "空白滴定体积", symbol: "V₀", value: "24.50", unit: "mL" },
        { label: "样品滴定体积", symbol: "V₁", value: "20.00", unit: "mL" },
        { label: "回流取样体积", symbol: "V₂", value: "10.0", unit: "mL" },
        { label: "稀释倍数", symbol: "f", value: "1", unit: "无量纲" },
      ],
      substitution: "ρ = 0.1000 × (24.50 − 20.00) × 8000 ÷ 10.0 × 1 = 360 mg/L",
      resultValue: codExampleResult.value,
      resultDisplay:
        codExampleResult.value === null ? "—" : String(Math.round(codExampleResult.value)),
      resultUnit: "mg/L",
    },
  ],
  exampleNote:
    "示例使用合成数据，结果由页面同一套纯函数计算；不会写入课堂草稿、CSV 或网址。",
  classroomNote:
    "本页课堂 COD 原始记录流程保持不变：原始读数、单位、记录编号和备注仍按原表单保存，不采用公开标准示例替代课堂数据，也不自动把读数换算为 COD 浓度。本校记录表到手后再核对字段和正式计算口径。",
};

export const bod5PublicStandard: PublicStandard = {
  id: "bod5",
  code: "HJ 505—2009",
  title: "水质 五日生化需氧量（BOD5）的测定 稀释与接种法",
  method: "稀释与接种法",
  issuer: "中华人民共和国生态环境部",
  issuedAt: "2009-10-20",
  effectiveAt: "2009-12-01",
  summary:
    "样品经稀释并按需接种后，在 20±1 ℃ 暗处培养，比较培养前后溶解氧并按稀释比例计算 BOD₅。公开标准参考只用于方法核对，不参与本页课堂原始记录计算。",
  scope: ["适用于地表水、工业废水和生活污水中五日生化需氧量的测定。"],
  limits: [
    { label: "检出限", value: "0.5 mg/L" },
    { label: "测定下限", value: "2 mg/L" },
    { label: "未稀释/未稀释接种上限", value: "6 mg/L" },
    { label: "稀释/稀释接种上限", value: "6000 mg/L" },
  ],
  fields: [
    {
      symbol: "ρ",
      name: "五日生化需氧量（BOD₅）",
      unit: "mg/L",
      detail: "按标准量程和结果表达规则报告。",
    },
    {
      symbol: "ρ₁",
      name: "样品或稀释样品培养前溶解氧",
      unit: "mg/L",
      detail: "培养前测定，样品应充满培养瓶并避免气泡。",
    },
    {
      symbol: "ρ₂",
      name: "样品或稀释样品培养后溶解氧",
      unit: "mg/L",
      detail: "20±1 ℃ 暗处培养 5 d±4 h 后测定。",
    },
    {
      symbol: "ρ₃",
      name: "空白或接种空白培养前溶解氧",
      unit: "mg/L",
      detail: "仅未稀释接种和稀释接种公式使用。",
    },
    {
      symbol: "ρ₄",
      name: "空白或接种空白培养后溶解氧",
      unit: "mg/L",
      detail: "仅未稀释接种和稀释接种公式使用。",
    },
    {
      symbol: "f₁",
      name: "接种稀释水或稀释水在培养液中的比例",
      unit: "无量纲",
      detail: "按实际配制比例填写，例如 0.8。",
    },
    {
      symbol: "f₂",
      name: "原样品在培养液中的比例",
      unit: "无量纲",
      detail: "例如 20 mL 样品定容至 100 mL 时，f₂=0.2。",
    },
  ],
  formulas: [
    {
      id: "bod5-undiluted",
      code: "标准式 (3)",
      name: "未稀释、未接种",
      expression: "ρ = ρ₁ − ρ₂",
      applicable: "样品无需稀释和接种，且预期 BOD₅ 不超过 6 mg/L。",
      notes: ["只使用样品培养前后的溶解氧差值。"],
    },
    {
      id: "bod5-undiluted-seeded",
      code: "标准式 (4)",
      name: "未稀释、接种",
      expression: "ρ = (ρ₁ − ρ₂) − (ρ₃ − ρ₄)",
      applicable: "样品未稀释，但需要接种微生物；空白为接种空白。",
      notes: ["接种空白用于扣除接种液本身的耗氧量。"],
    },
    {
      id: "bod5-diluted",
      code: "标准式 (5)",
      name: "稀释或稀释接种",
      expression: "ρ = [(ρ₁ − ρ₂) − (ρ₃ − ρ₄) × f₁] ÷ f₂",
      applicable:
        "样品经稀释后培养，或同时进行稀释与接种；f₁、f₂ 必须与培养液实际配制一致。",
      notes: [
        "f₁ 为接种稀释水或稀释水在培养液中的比例，f₂ 为原样品在培养液中的比例。",
        "只能采用满足溶解氧消耗、剩余溶解氧和质控要求的有效培养瓶。",
      ],
    },
  ],
  conditions: [
    "在 20±1 ℃ 暗处培养 5 d±4 h；也可先在 0–4 ℃ 暗处培养 2 d，再在 20±1 ℃ 暗处培养 5 d，即 (2+5)d±4 h。",
    "预计 BOD₅ 大于 6 mg/L 时，样品需要稀释；缺少微生物的工业废水（酸性、碱性、高温、冷冻、氯化）需要接种。",
    "稀释水温度为 20±1 ℃，曝气至少 1 h，溶解氧不低于 8 mg/L；每升稀释水加入四种盐溶液各 1.0 mL，配制后 24 h 内使用。",
    "接种稀释水 pH 为 7.2，BOD₅ 小于 1.5 mg/L。",
    "结果报告应注明样品是否经过过滤、冷冻或均质化处理。",
  ],
  qualityControl: [
    { label: "分析空白", value: "每批 2 个" },
    { label: "稀释空白 BOD₅", value: "≤0.5 mg/L" },
    { label: "未稀释接种/稀释接种空白", value: "≤1.5 mg/L" },
    {
      label: "葡萄糖-谷氨酸标准溶液",
      value: "180–230 mg/L",
      detail: "20 mL 标准溶液稀释至 1000 mL 后测定。",
    },
    {
      label: "平行样相对偏差",
      value: "<3 mg/L：≤±15%；3–100 mg/L：≤±20%；>100 mg/L：≤±25%",
      detail: "RP = |ρ₁ − ρ₂| ÷ (ρ₁ + ρ₂) × 100%。",
    },
  ],
  dilutionTable: [
    { expected: "6–12", multiple: "2" },
    { expected: "10–30", multiple: "5" },
    { expected: "20–60", multiple: "10" },
    { expected: "40–120", multiple: "20" },
    { expected: "100–300", multiple: "50" },
    { expected: "200–600", multiple: "100" },
    { expected: "400–1200", multiple: "200" },
    { expected: "1000–3000", multiple: "500" },
    { expected: "2000–6000", multiple: "1000" },
  ],
  dilutionNote:
    "表中“预期 BOD₅”和“稀释倍数”来自 HJ 505—2009 表 2；实际稀释倍数还要满足培养后剩余溶解氧和耗氧量要求。",
  reporting: [
    "结果小于 100 mg/L 时保留一位小数；100–1000 mg/L 时保留整数；大于 1000 mg/L 时用科学计数法表示。",
    "报告应注明样品是否经过过滤、冷冻或均质化处理。",
  ],
  sources: [...officialSources.filter((source) => source.id === "mee-hj505-2009"), ...teachingSources],
  examples: [
    {
      id: "bod5-undiluted-example",
      code: "式 (3) 示例",
      title: "未稀释、未接种",
      note: "合成数据；培养前后溶解氧差值直接作为 BOD₅。",
      rows: [
        { label: "样品培养前溶解氧", symbol: "ρ₁", value: "8.0", unit: "mg/L" },
        { label: "样品培养后溶解氧", symbol: "ρ₂", value: "3.0", unit: "mg/L" },
      ],
      substitution: "ρ = 8.0 − 3.0 = 5.0 mg/L",
      resultValue: bodUndilutedResult.value,
      resultDisplay: formatFixedOne(bodUndilutedResult.value),
      resultUnit: "mg/L",
    },
    {
      id: "bod5-seeded-example",
      code: "式 (4) 示例",
      title: "未稀释、接种",
      note: "合成数据；扣除接种空白自身的耗氧量。",
      rows: [
        { label: "样品培养前溶解氧", symbol: "ρ₁", value: "8.0", unit: "mg/L" },
        { label: "样品培养后溶解氧", symbol: "ρ₂", value: "3.0", unit: "mg/L" },
        { label: "空白培养前溶解氧", symbol: "ρ₃", value: "8.5", unit: "mg/L" },
        { label: "空白培养后溶解氧", symbol: "ρ₄", value: "8.0", unit: "mg/L" },
      ],
      substitution: "ρ = (8.0 − 3.0) − (8.5 − 8.0) = 4.5 mg/L",
      resultValue: bodSeededResult.value,
      resultDisplay: formatFixedOne(bodSeededResult.value),
      resultUnit: "mg/L",
    },
    {
      id: "bod5-diluted-example",
      code: "式 (5) 示例",
      title: "稀释、接种",
      note: "合成数据；按 f₁ = 0.8、f₂ = 0.2 校正空白并折算原样品。",
      rows: [
        { label: "样品培养前溶解氧", symbol: "ρ₁", value: "8.0", unit: "mg/L" },
        { label: "样品培养后溶解氧", symbol: "ρ₂", value: "3.0", unit: "mg/L" },
        { label: "空白培养前溶解氧", symbol: "ρ₃", value: "8.5", unit: "mg/L" },
        { label: "空白培养后溶解氧", symbol: "ρ₄", value: "8.0", unit: "mg/L" },
        { label: "稀释水比例", symbol: "f₁", value: "0.8", unit: "无量纲" },
        { label: "原样品比例", symbol: "f₂", value: "0.2", unit: "无量纲" },
      ],
      substitution: "ρ = [(8.0 − 3.0) − (8.5 − 8.0) × 0.8] ÷ 0.2 = 23.0 mg/L",
      resultValue: bodDilutedResult.value,
      resultDisplay: formatFixedOne(bodDilutedResult.value),
      resultUnit: "mg/L",
    },
  ],
  exampleNote:
    "三个示例覆盖标准式 (3)、(4)、(5)，全部使用合成数据；结果由页面同一套纯函数计算，不会写入课堂草稿、CSV 或网址。",
  classroomNote:
    "本页课堂 BOD₅ 两段原始记录流程保持不变：首段和次段仍按原表单保存日期、原始读数和单位，不采用公开标准示例替代课堂数据，也不自动计算 BOD₅。待本校记录表到手后再核对字段、稀释接种信息和正式计算口径。",
};

export const publicStandardByCourse = {
  cod: codPublicStandard,
  bod5: bod5PublicStandard,
} as const;