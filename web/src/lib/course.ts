export const COURSE_ROUTE_ID = "course";
export const COURSE_SESSION_ONE_ID = "1";
export const COURSE_SESSION_FORMALDEHYDE_ID = "2";
export const COURSE_SESSION_COD_ID = "3";
export const COURSE_SESSION_PHENOL_ID = "4";
export const COURSE_SESSION_SO2_ID = "5";
export const COURSE_SESSION_BOD5_FIRST_ID = "6";
export const COURSE_SESSION_BOD5_SECOND_ID = "7";
export const COURSE_SESSION_COMFORT_ID = "8";
export const AVAILABLE_COURSE_SESSION_IDS = [
  COURSE_SESSION_ONE_ID,
  COURSE_SESSION_FORMALDEHYDE_ID,
  COURSE_SESSION_COD_ID,
  COURSE_SESSION_PHENOL_ID,
  COURSE_SESSION_SO2_ID,
  COURSE_SESSION_BOD5_FIRST_ID,
  COURSE_SESSION_BOD5_SECOND_ID,
  COURSE_SESSION_COMFORT_ID,
] as const;

export type CourseSessionStatus = "available" | "planned";

export interface CourseSession {
  id: string;
  order: number;
  title: string;
  focus: string;
  method: string;
  status: CourseSessionStatus;
  entryLabel?: string;
  archive?: {
    id: string;
    label: string;
  };
}

export const courseSessions: CourseSession[] = [
  {
    id: COURSE_SESSION_ONE_ID,
    order: 1,
    title: "废水悬浮固体及浊度",
    focus: "用重量法测悬浮固体、浊度计法测浊度；两张表共用样品编号，可以只填其中一张。",
    method: "重量法 · 浊度计法",
    status: "available",
    entryLabel: "进入实验一",
    archive: {
      id: "water-turbidity-nephelometry",
      label: "已有浊度档案",
    },
  },
  {
    id: COURSE_SESSION_FORMALDEHYDE_ID,
    order: 2,
    title: "空气中甲醛的测定",
    focus: "保存采样点或样品编号、测定日期、测量项目、原始读数、单位与记录编号；公式和合格判定待讲义确认。",
    method: "空气采样 · 分光光度法",
    status: "available",
    entryLabel: "进入甲醛原始记录",
  },
  {
    id: "3",
    order: 3,
    title: "化学需氧量（COD）的测定",
    focus: "本轮先保存样品号、日期、原始读数与仪器单位、原始记录编号；不自动计算 COD 浓度。",
    method: "重铬酸盐法 · HJ 828-2017",
    status: "available",
    entryLabel: "进入 COD 原始记录",
    archive: {
      id: "water-cod-dichromate",
      label: "已有 COD 档案",
    },
  },
  {
    id: COURSE_SESSION_PHENOL_ID,
    order: 4,
    title: "水中挥发酚的测定",
    focus: "保存样品编号、测定日期、测量项目、原始读数、单位与记录编号；蒸馏、萃取和计算规则待讲义确认。",
    method: "4-氨基安替比林分光光度法 · HJ 503-2009",
    status: "available",
    entryLabel: "进入挥发酚原始记录",
  },
  {
    id: COURSE_SESSION_SO2_ID,
    order: 5,
    title: "空气中二氧化硫的测定",
    focus: "填写六点标准曲线、样品吸光度、试剂空白与标况体积，按讲义公式计算样品 SO₂ 浓度；不判断达标。",
    method: "甲醛缓冲溶液吸收—盐酸副玫瑰苯胺分光光度法",
    status: "available",
    entryLabel: "进入 SO₂ 测定",
  },
  {
    id: "6",
    order: 6,
    title: "五日生化需氧量（BOD₅）测定（一）",
    focus: "打开同一份 BOD₅ 本地样品，先填首段日期、原始读数与单位；不把缺失当作 0。",
    method: "稀释与接种法 · HJ 505-2009",
    status: "available",
    entryLabel: "进入 BOD₅ 首段",
    archive: {
      id: "water-bod5-dilution-seeding",
      label: "已有 BOD₅ 档案",
    },
  },
  {
    id: "7",
    order: 7,
    title: "五日生化需氧量（BOD₅）测定（二）",
    focus: "继续同一份 BOD₅ 本地样品，补填次段测量；分别显示两段是否齐全，不自动算 BOD₅。",
    method: "稀释与接种法 · HJ 505-2009",
    status: "available",
    entryLabel: "进入 BOD₅ 次段",
    archive: {
      id: "water-bod5-dilution-seeding",
      label: "已有 BOD₅ 档案",
    },
  },
  {
    id: COURSE_SESSION_COMFORT_ID,
    order: 8,
    title: "人居环境舒适度的测定",
    focus: "逐行保存房间或点位、测量项目（温度、湿度、风速等）、原始读数与单位；评价指标和分级规则待讲义确认。",
    method: "环境指标记录 · 规则待确认",
    status: "available",
    entryLabel: "进入舒适度原始记录",
  },
];

export const experimentOneMeta = {
  title: "废水悬浮固体及浊度",
  english: "Suspended solids and turbidity",
  method: "悬浮固体：重量法；浊度：浊度计法",
  standards: "GB 11901-89 · HJ 1075-2019",
  purpose:
    "用同一份废水样品完成悬浮固体和浊度两组记录：悬浮固体按称量质量差与水样体积计算浓度，浊度按仪器读数和相同单位计算组均值。",
  sampleFields: [
    "样品编号由两张表共用，修改一次即可同步到两条记录。",
    "组别和测定日期用于样品归属与导出摘要，不写入网址。",
    "图片只保存在当前浏览器的 IndexedDB，不随摘要导出。",
  ],
  pending: [
    "水样体积按 mL 录入；如果讲义采用 L，需要先换算再填写。",
    "悬浮固体质量可以使用 mg 或 g，本页统一折算为 mg 后计算。",
    "浊度组均值只在仪器单位一致时计算；混用单位时暂停均值并提示。",
    "浓度页面显示 1 至 2 位小数，正式报告的修约规则以课程讲义为准。",
    "平行样数量、空白、质控样和异常值处理要求以课程讲义为准。",
  ],
  formula: "C（mg/L） = [m后（mg） − m前（mg）] × 1000 ÷ V（mL）",
};

export interface CourseReference {
  label: string;
  detail: string;
  href?: string;
  actionLabel?: string;
}

export const experimentOneReferences: CourseReference[] = [
  {
    label: "GB 11901-89《水质 悬浮物的测定 重量法》",
    detail: "悬浮固体教学样板采用的公开重量法参考，适用于生活污水和工业废水。课堂采用的方法与版本待老师确认。",
  },
  {
    label: "HJ 1075-2019《水质 浊度的测定 浊度计法》",
    detail: "公开浊度计法参考，标准适用于地表水、地下水和海水。课堂废水样品的测定条件和仪器单位待老师确认。",
    href: "#/experiments?id=water-turbidity-nephelometry",
    actionLabel: "打开已有浊度档案",
  },
  {
    label: "《环境监测实验技术》",
    detail: "施文健、周化岚主编，北京大学出版社，2009，ISBN 978-7-301-14454-1。",
  },
];

export const codEntryMeta = {
  title: "实验三 COD 原始记录",
  english: "COD raw record",
  method: "重铬酸盐法",
  standards: "HJ 828-2017",
  purpose:
    "为课程 COD 实验保存一份可核对的原始记录：样品编号、日期、原始读数及仪器单位、原始记录编号和备注。本页只做字段校验与本地草稿，不自动计算课程浓度。",
  syntheticNote:
    "合成样例用于核对字段、校验、刷新恢复和 CSV 导出，不是真实测量。开始真实记录前请清空表单。",
  pending: [
    "原始读数代表滴定体积、吸光度还是仪器直读值，待课程讲义确认。",
    "仪器单位按原始记录保留，本页不做单位换算，也不把读数当作 COD 浓度。",
    "硫酸亚铁铵浓度、空白滴定体积、水样体积、稀释倍数与氯化物校正规则待确认。",
    "公开标准公式、字段和量程已列在页面下方；本校课堂是否采用同一滴定流程、原始读数如何对应 V₀/V₁/V₂ 仍待讲义确认。",
    "平行样、空白、质控样和修约规则以课程讲义为准。",
    "本轮不计算 COD 浓度、不判断结果是否合格，也不生成正式结论。",
  ],
};

export const codReferences: CourseReference[] = [
  {
    label: "HJ 828-2017《水质 化学需氧量的测定 重铬酸盐法》",
    detail:
      "公开标准页、官方 PDF、公式与量程已整理在页面下方“公开标准参考”；本页课堂原始记录仍不自动计算，正式口径以课程讲义和记录表为准。",
    href: "#/experiments?id=water-cod-dichromate",
    actionLabel: "打开已有 COD 档案",
  },
  {
    label: "《环境监测实验技术》",
    detail: "施文健、周化岚主编，北京大学出版社，2009，ISBN 978-7-301-14454-1。",
  },
];

export const so2EntryMeta = {
  title: "实验五 空气中二氧化硫的测定",
  english: "Determination of sulfur dioxide in ambient air",
  courseLabel: "课表第 5 课次",
  handoutLabel: "讲义实验四 · 第 28–30 页",
  method: "甲醛缓冲溶液吸收—盐酸副玫瑰苯胺分光光度法",
  standards: "课程讲义实验四 · 第 28–30 页",
  purpose:
    "本轮保存样品信息、样品与试剂空白吸光度、标况采样体积，并填入六个标准点的 570 nm 吸光度。六点拟合后按讲义第 30 页公式计算样品 SO₂ 浓度，只提示复核，不判断达标。",
  syntheticNote:
    "合成样例的六点吸光度与 A、A₀、V₀ 仅用于核对拟合、计算和 CSV；预期 b = 0.05、Bs = 20、C = 0.25 mg/m³。不是真实测量，开始真实记录前请清空表单。",
  pending: [
    "第 29 页标准溶液标定公式属于另一个环节，本轮不纳入样品计算。",
    "V₀ 由学生按课堂要求换算后填写；本页不预填 20 L，也不把采样器实测体积自动当作 V₀。",
    "A₀ 单独填写，本页不自动采用 0 μg 标准管的吸光度代替。",
    "六点拟合采用普通最小二乘，不强制过原点；R² 只描述拟合，不设合格线。",
    "空白只按样品公式扣除 A₀ 一次，不再减拟合截距；推算量超出曲线或 A 低于 A₀ 时只提示复核，不判断达标。",
    "采样流量、吸收液、质控样和修约要求待讲义及教师确认。",
  ],
};

export const so2References: CourseReference[] = [
  {
    label: "《实验四 空气中SO₂的测定》课程讲义，第 28–30 页",
    detail:
      "课表第 5 课次对应讲义实验四。本轮只采用第 28–30 页的读数、标准曲线和样品计算公式；第 29 页标准溶液标定公式不纳入。课堂记录表、报告照片或教师算例待补。",
  },
];

export const bod5EntryMeta = {
  title: "BOD₅ 两段原始记录",
  english: "BOD5 two-stage raw record",
  method: "稀释与接种法",
  standards: "HJ 505-2009",
  purpose:
    "第 6 和第 7 课次共用同一份本地样品记录，分别保存首段与次段的日期、原始读数和单位。页面分别显示两段是否齐全，缺失字段不按 0 处理，也不自动计算 BOD₅。",
  syntheticNote:
    "合成样例用于核对字段、两段续填、刷新恢复和 CSV 导出，不是真实测量。开始真实记录前请清空表单。",
  pending: [
    "首段和次段分别需要的测量条件与记录格式待课程讲义确认。",
    "原始读数单位按记录保留，本页不换算，也不判断两段单位是否可合并。",
    "稀释倍数、接种液、空白校正、培养温度、培养时间和质控要求待确认。",
    "公开标准的式 (3)–(5)、稀释倍数表和质控判据已列在页面下方；本校课堂两段读数如何对应 ρ₁/ρ₂ 仍待记录表确认。",
    "只有字段齐全的提示，不代表培养瓶有效或质控合格。",
    "本轮不计算 BOD₅、耗氧差值或正式结论。",
  ],
};

export const bod5References: CourseReference[] = [
  {
    label: "HJ 505-2009《水质 五日生化需氧量（BOD5）的测定 稀释与接种法》",
    detail:
      "公开标准页、官方 PDF、式 (3)–(5)、稀释倍数表和质控判据已整理在页面下方“公开标准参考”；本页课堂原始记录仍不自动计算，正式口径以课程讲义和记录表为准。",
    href: "#/experiments?id=water-bod5-dilution-seeding",
    actionLabel: "打开已有 BOD₅ 档案",
  },
  {
    label: "《环境监测实验技术》",
    detail: "施文健、周化岚主编，北京大学出版社，2009，ISBN 978-7-301-14454-1。",
  },
];

export function getCourseSession(id: string) {
  return courseSessions.find((session) => session.id === id) ?? null;
}
