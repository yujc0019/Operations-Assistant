import {
  BookOutlined,
  CodeOutlined,
  DashboardOutlined,
  FileTextOutlined,
  SafetyOutlined
} from "@ant-design/icons";
import type { ReactNode } from "react";

/**
 * 运维示例话题的唯一数据源
 *
 * 欢迎页示例卡片（ConversationThread）和侧边栏常用工具（Sidebar）都从这里取数，
 * 避免同一话题的文案在两处各自维护、逐渐分叉。
 * 一个话题可以同时是卡片和工具（如日志分析），也可以只出现在其中一侧。
 */
export interface OpsTopic {
  /** 话题唯一标识 */
  id: string;
  /** 欢迎页卡片标题；不作为卡片展示时为 null */
  cardTitle: string | null;
  /** 侧边栏工具名；不作为工具展示时为 null */
  toolName: string | null;
  /** 定向对话模式标识，与后端 /api/task 的 tool 参数一一对应 */
  mode: ToolMode | null;
  /** 点击后预填到输入框的问题 */
  question: string;
  /** 卡片与工具模式共用的一句话说明 */
  description: string;
  icon: ReactNode;
  /** 工具模式输入框占位文案；仅工具话题携带 */
  placeholder?: string;
  /** 工具模式欢迎页展示的示例问题；仅工具话题携带 */
  examples?: string[];
}

/** 后端支持的定向模式标识 */
export type ToolMode = "log" | "metrics" | "command" | "kb";

/** 工具模式的展示元数据：进入模式后的引导、示例与输入框提示 */
export interface ToolModeMeta {
  mode: ToolMode;
  toolName: string;
  icon: ReactNode;
  description: string;
  placeholder: string;
  examples: string[];
}

const OPS_TOPICS: OpsTopic[] = [
  {
    id: "troubleshoot",
    cardTitle: "故障排查",
    toolName: null,
    mode: null,
    question: "服务器CPU 100% 可能是什么原因?",
    description: "基于监控、日志、告警关联分析定位",
    icon: <SafetyOutlined aria-hidden />
  },
  {
    id: "log-analysis",
    cardTitle: "日志分析",
    toolName: "日志分析",
    mode: "log",
    question: "查看最近5分钟的错误日志",
    description: "上传日志文件，定向分析错误分布并定位根因",
    icon: <FileTextOutlined aria-hidden />,
    placeholder: "描述你的分析需求，例如：统计最近的错误并分析原因",
    examples: [
      "统计日志中的错误分布，找出最高频的异常",
      "分析最近的报错，给出根因分析和处置建议"
    ]
  },
  {
    id: "command",
    cardTitle: "配置/命令",
    toolName: "命令助手",
    mode: "command",
    question: "如何重启Nginx服务?",
    description: "检索内置命令库，提供标准命令、风险等级和操作步骤",
    icon: <CodeOutlined aria-hidden />,
    placeholder: "描述你的场景，例如：查看 8080 端口被哪个进程占用",
    examples: [
      "如何查看 8080 端口被哪个进程占用？",
      "k8s 里 Pod 一直 Pending，用什么命令排查？"
    ]
  },
  {
    id: "knowledge",
    cardTitle: "知识问答",
    toolName: "知识库",
    mode: "kb",
    question: "k8s Pod一直处于Pending状态怎么办?",
    description: "在内部知识库中检索运维手册、预案与制度文档",
    icon: <BookOutlined aria-hidden />,
    placeholder: "向内部知识库提问，例如：数据库故障的处置预案是什么",
    examples: [
      "内部运维手册里，数据库主从切换的步骤是什么？",
      "公司对线上变更的审批流程是怎么规定的？"
    ]
  },
  {
    id: "monitor",
    cardTitle: null,
    toolName: "监控查询",
    mode: "metrics",
    question: "查看服务器 CPU 和内存的监控情况，评估当前负载",
    description: "用自然语言查询 Prometheus 监控数据，解读指标走势与异常",
    icon: <DashboardOutlined aria-hidden />,
    placeholder: "描述要查询的指标，例如：web-01 最近1小时 CPU 情况",
    examples: [
      "查看当前所有主机的 CPU 使用率",
      "最近1小时内存使用率趋势，有没有持续走高"
    ]
  }
];

/** 欢迎页 2×2 示例卡片（保持定义顺序） */
export const OPS_EXAMPLES = OPS_TOPICS.filter(
  (topic): topic is OpsTopic & { cardTitle: string } => topic.cardTitle !== null
);

/** 携带完整工具模式信息的话题 */
export type ToolTopic = OpsTopic & {
  mode: ToolMode;
  toolName: string;
  placeholder: string;
  examples: string[];
};

function isToolTopic(topic: OpsTopic): topic is ToolTopic {
  return (
    topic.mode !== null &&
    topic.toolName !== null &&
    topic.placeholder !== undefined &&
    topic.examples !== undefined
  );
}

/** 侧边栏常用工具（保持定义顺序） */
export const QUICK_TOOLS: ToolTopic[] = OPS_TOPICS.filter(isToolTopic);

/** 全部工具模式元数据，由工具话题派生，保证与侧边栏数据一致 */
export const TOOL_MODES: ToolModeMeta[] = QUICK_TOOLS.map(
  ({ mode, toolName, icon, description, placeholder, examples }) => ({
    mode,
    toolName,
    icon,
    description,
    placeholder,
    examples
  })
);

/** 按模式标识取元数据；找不到返回 null */
export function getToolModeMeta(mode: string | null | undefined): ToolModeMeta | null {
  if (!mode) {
    return null;
  }
  return TOOL_MODES.find((item) => item.mode === mode) ?? null;
}
