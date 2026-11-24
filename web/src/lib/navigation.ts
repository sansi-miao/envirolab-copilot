import {
  BookOpen,
  Calculator,
  Compass,
  FileCode2,
  FlaskConical,
  FolderKanban,
  GraduationCap,
  Home,
  LineChart,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type RouteId =
  | "home"
  | "discover"
  | "experiments"
  | "course"
  | "workbench"
  | "calculators"
  | "analysis"
  | "knowledge"
  | "agent-workflow"
  | "projects";

export type NavigationGroup = "开始" | "科研流程" | "规划中";

export type NavigationItem = {
  id: RouteId;
  label: string;
  english: string;
  title: string;
  description: string;
  phase: string;
  group: NavigationGroup;
  icon: LucideIcon;
  features: string[];
  available: boolean;
};

export const navigation: NavigationItem[] = [
  {
    id: "home",
    label: "科研概览",
    english: "Overview",
    title: "科研概览",
    description: "查实验、传数据、看懂结果",
    phase: "当前可用",
    group: "开始",
    icon: Home,
    features: [],
    available: true,
  },
  {
    id: "experiments",
    label: "实验档案",
    english: "Archive",
    title: "实验档案与步骤",
    description: "检索真实实验的方法、材料、步骤、公式与文献来源",
    phase: "真实档案 · 只读",
    group: "科研流程",
    icon: FlaskConical,
    features: ["按学科检索实验档案", "查看完整步骤与变量", "公式、适用条件与原始来源"],
    available: true,
  },
  {
    id: "course",
    label: "环境监测课程",
    english: "Course",
    title: "环境监测课程实验",
    description: "八个课次均已开放本地记录，含 COD、SO₂、BOD₅、甲醛、挥发酚与舒适度",
    phase: "8 个课次本地可用",
    group: "科研流程",
    icon: GraduationCap,
    features: [
      "实验一双表计算、图表与摘要",
      "COD 原始读数与记录编号校验",
      "SO₂ 六点标准曲线与样品浓度计算",
      "BOD₅ 首段/次段共用本地草稿",
      "甲醛、挥发酚与舒适度共用逐行原始记录",
    ],
    available: true,
  },
  {
    id: "analysis",
    label: "数据分析",
    english: "Analysis",
    title: "实验数据分析",
    description: "上传实验数据，生成图表并检查数据质量",
    phase: "本地可用",
    group: "科研流程",
    icon: LineChart,
    features: [
      "CSV、TSV 与 Excel 粘贴解析",
      "折线、散点、柱状图与线性拟合",
      "缺失、重复、异常值检查",
    ],
    available: true,
  },
  {
    id: "projects",
    label: "我的项目",
    english: "Projects",
    title: "我的项目",
    description: "新建个人实验，查看保存在当前浏览器中的实验与分析记录",
    phase: "本地保存",
    group: "科研流程",
    icon: FolderKanban,
    features: [
      "新建个人实验并手填自定义表头",
      "导入 CSV、TSV 或 Excel 粘贴表格",
      "关联现场或讲义照片并导出 CSV",
      "保留已有分析记录的打开与摘要导出",
    ],
    available: true,
  },
  {
    id: "agent-workflow",
    label: "Agent 工作流",
    english: "Template",
    title: "Agent 科研工作流模板",
    description: "把完整科研流程提示词复制到你自己的 Agent",
    phase: "可复制",
    group: "科研流程",
    icon: FileCode2,
    features: ["7 阶段科研流程提示词", "工具、权限与停止条件", "复制与 Markdown 下载"],
    available: true,
  },
  {
    id: "discover",
    label: "文献发现",
    english: "Discover",
    title: "文献发现",
    description: "把研究问题变成可核验的 Crossref 文献线索",
    phase: "Crossref 检索 · 本地联调",
    group: "科研流程",
    icon: Compass,
    features: ["研究问题预填为可编辑草稿", "关键词与 DOI 两种检索模式", "超时、限流与重试状态"],
    available: true,
  },
  {
    id: "workbench",
    label: "实验工作台",
    english: "Workbench",
    title: "实验工作台",
    description: "把实验档案、数据、计算和结论组织在同一研究上下文",
    phase: "尚未开放",
    group: "规划中",
    icon: Workflow,
    features: ["结构化实验步骤与变量", "计算和数据结果关联", "不确定性与证据来源记录"],
    available: false,
  },
  {
    id: "calculators",
    label: "科学计算",
    english: "Calculators",
    title: "科学计算中心",
    description: "由确定性模块执行计算并解释适用条件",
    phase: "尚未开放",
    group: "规划中",
    icon: Calculator,
    features: ["公式、单位与参数校验", "可复现的计算过程", "结果解释与适用条件"],
    available: false,
  },
  {
    id: "knowledge",
    label: "知识数据库",
    english: "Knowledge",
    title: "知识数据库",
    description: "集中管理文献证据、实验引用和公式适用边界",
    phase: "尚未开放",
    group: "规划中",
    icon: BookOpen,
    features: ["文献来源与 DOI 追溯", "摘要和全文证据分级", "实验、公式与计算模块关联"],
    available: false,
  },
];

export const navigationGroups: NavigationGroup[] = ["开始", "科研流程", "规划中"];

export function isRouteId(value: string): value is RouteId {
  return navigation.some((item) => item.id === value);
}

export function getNavigationItem(route: RouteId) {
  return navigation.find((item) => item.id === route) ?? navigation[0];
}
