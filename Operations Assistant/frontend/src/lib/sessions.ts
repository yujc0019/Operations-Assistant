import type { ChatTurn } from "../types";

/**
 * 浏览器本地会话存储
 *
 * 后端不持久化对话（刷新即丢），因此“对话历史”由前端保存在 localStorage：
 * 每个会话记录 thread_id、标题（取首条提问）和完整回合，点击历史项即可回看。
 */

const STORAGE_KEY = "ops-assistant.sessions";
const MAX_SESSIONS = 30;
const MAX_TITLE_LENGTH = 20;

export interface SessionRecord {
  threadId: string;
  title: string;
  turns: ChatTurn[];
  createdAt: string;
  updatedAt: string;
}

function parseSessions(raw: string | null): SessionRecord[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as SessionRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    // 过滤掉缺关键字段的脏数据，避免单条坏记录拖垮整个列表渲染
    return parsed.filter(
      (item) => item && typeof item.threadId === "string" && Array.isArray(item.turns)
    );
  } catch {
    return [];
  }
}

export function listSessions(): SessionRecord[] {
  const sessions = parseSessions(window.localStorage.getItem(STORAGE_KEY));
  sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return sessions;
}

export function getSession(threadId: string): SessionRecord | undefined {
  return listSessions().find((session) => session.threadId === threadId);
}

/** 由首条用户提问派生会话标题，过长时截断 */
export function deriveSessionTitle(turns: ChatTurn[]): string {
  const firstContent = turns[0]?.content.trim() ?? "";
  if (!firstContent) {
    return "未命名对话";
  }
  return firstContent.length > MAX_TITLE_LENGTH
    ? `${firstContent.slice(0, MAX_TITLE_LENGTH)}…`
    : firstContent;
}

/**
 * 把回合标记为非执行中，得到可持久化/可恢复的历史快照
 * 切走再切回时任务已不再 attached 到当前视图，保留 isRunning 会渲染出假加载态
 */
export function markTurnsIdle(turns: ChatTurn[]): ChatTurn[] {
  return turns.map((turn) => (turn.isRunning ? { ...turn, isRunning: false } : turn));
}

/** 插入或更新一个会话（按 thread_id 去重），并裁剪到上限数量 */
export function saveSession(record: SessionRecord): void {
  const sessions = listSessions().filter((item) => item.threadId !== record.threadId);
  sessions.unshift(record);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sessions.slice(0, MAX_SESSIONS))
  );
}

export function removeSession(threadId: string): void {
  const sessions = listSessions().filter((item) => item.threadId !== threadId);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}
