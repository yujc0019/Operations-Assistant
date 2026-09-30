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
 * 避免同一话题的问题文案在两处各自维护、逐渐分叉。
 * 一个话题可以同时是卡片和工具（如日志分析），也可以只出现在其中一侧。
 */
export interface OpsTopic {
  /** 话题唯一标识 */
  id: string;
  /** 欢迎页卡片标题；不作为卡片展示时为 null */
  cardTitle: string | null;
  /** 侧边栏工具名；不作为工具展示时为 null */
  toolName: string | null;
  /** 点击后预填到输入框的问题 */
  question: string;
  /** 欢迎页卡片描述；纯工具话题可为空串 */
  description: string;
  icon: ReactNode;
}

const OPS_TOPICS: OpsTopic[] = [
  {
    id: "troubleshoot",
    cardTitle: "故障排查",
    toolName: null,
    question: "服务器CPU 100% 可能是什么原因?",
    description: "基于监控、日志、告警关联分析定位",
    icon: <SafetyOutlined aria-hidden />
  },
  {
    id: "log-analysis",
    cardTitle: "日志分析",
    toolName: "日志分析",
    question: "查看最近5分钟的错误日志",
    description: "支持多种日志格式，快速定位问题",
    icon: <FileTextOutlined aria-hidden />
  },
  {
    id: "command",
    cardTitle: "配置/命令",
    toolName: "命令助手",
    question: "如何重启Nginx服务?",
    description: "提供标准命令和操作步骤",
    icon: <CodeOutlined aria-hidden />
  },
  {
    id: "knowledge",
    cardTitle: "知识问答",
    toolName: "知识库",
    question: "k8s Pod一直处于Pending状态怎么办?",
    description: "基于运维知识和最佳实践",
    icon: <BookOutlined aria-hidden />
  },
  {
    id: "monitor",
    cardTitle: null,
    toolName: "监控查询",
    question: "查看服务器 CPU 和内存的监控情况，评估当前负载",
    description: "",
    icon: <DashboardOutlined aria-hidden />
  }
];

/** 欢迎页 2×2 示例卡片（保持定义顺序） */
export const OPS_EXAMPLES = OPS_TOPICS.filter((topic) => topic.cardTitle !== null);

/** 侧边栏常用工具（保持定义顺序） */
export const QUICK_TOOLS = OPS_TOPICS.filter((topic) => topic.toolName !== null);
