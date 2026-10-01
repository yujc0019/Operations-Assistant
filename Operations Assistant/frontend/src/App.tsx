import { Alert, App as AntApp, Button } from "antd";
import { useEffect, useRef, useState } from "react";
import { ChatComposer } from "./components/ChatComposer";
import { ConversationThread } from "./components/ConversationThread";
import { Sidebar } from "./components/Sidebar";
import { ToolModeBanner } from "./components/ToolModeBanner";
import { useBackendHealth } from "./hooks/useBackendHealth";
import { getToolModeMeta } from "./lib/opsTopics";
import type { ToolModeMeta } from "./lib/opsTopics";
import {
  deriveSessionTitle,
  getSession,
  listSessions,
  markTurnsIdle,
  removeSession,
  saveSession
} from "./lib/sessions";
import type { SessionRecord } from "./lib/sessions";
import { useDeepAgentSession } from "./hooks/useDeepAgentSession";
import type { ChatTurn, UploadedItem } from "./types";

function createTurn(content: string, tool?: string): ChatTurn {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
    content,
    events: [],
    files: [],
    filesTruncated: false,
    isRunning: true,
    result: "",
    tool,
    timestamp: new Date().toISOString()
  };
}

export default function App() {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState("");
  const [stagedItems, setStagedItems] = useState<UploadedItem[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>(() => listSessions());
  // 当前激活的定向工具模式；null 表示普通模式（主智能体自由编排）
  const [activeTool, setActiveTool] = useState<ToolModeMeta | null>(null);
  const streamRef = useRef<HTMLElement | null>(null);
  const session = useDeepAgentSession();
  const health = useBackendHealth();

  useEffect(() => {
    setTurns((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      // 刚切换/重置会话时流状态已被清空，不能用空数据覆盖历史恢复回来的回合
      if (session.events.length === 0 && !session.result && session.files.length === 0) {
        return previous;
      }

      const latestTurn = previous[previous.length - 1];
      const nextLatestTurn = {
        ...latestTurn,
        events: session.events,
        files: session.files,
        filesTruncated: session.filesTruncated,
        isRunning: session.isRunning,
        result: session.result
      };

      return [...previous.slice(0, -1), nextLatestTurn];
    });
  }, [session.events, session.files, session.filesTruncated, session.isRunning, session.result]);

  useEffect(() => {
    const streamNode = streamRef.current;
    if (!streamNode) {
      return;
    }

    window.requestAnimationFrame(() => {
      streamNode.scrollTo({
        top: streamNode.scrollHeight,
        behavior: "smooth"
      });
    });
  }, [turns]);

  // 当前会话有内容时自动持久化到 localStorage，供“对话历史”回看
  useEffect(() => {
    if (turns.length === 0) {
      return;
    }

    saveSession({
      threadId: session.threadId,
      title: deriveSessionTitle(turns),
      turns: markTurnsIdle(turns),
      createdAt: turns[0].timestamp,
      updatedAt: new Date().toISOString()
    });
    setSessions(listSessions());
  }, [turns, session.threadId]);

  /** 清空输入框与待上传附件；新建/切换/删除会话都会回到干净状态 */
  function clearComposerState() {
    setQuery("");
    setStagedItems([]);
  }

  async function handleSubmit() {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      message.warning("请输入运维问题");
      return;
    }

    const toolMode = activeTool?.mode;
    const nextTurn = createTurn(cleanQuery, toolMode);
    setTurns((previous) => [...previous, nextTurn]);
    setQuery("");

    try {
      await session.submitTask(cleanQuery, toolMode ?? "auto");
      message.success("任务已启动，执行过程会显示在对话中");
    } catch (error) {
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === nextTurn.id
            ? {
                ...turn,
                isRunning: false,
                error: error instanceof Error ? error.message : "任务启动失败"
              }
            : turn
        )
      );
      message.error(error instanceof Error ? error.message : "任务启动失败");
    }
  }

  async function handleCancel() {
    try {
      const response = await session.cancelCurrentTask();
      message.info(response.status === "cancelling" ? "取消请求已发送，正在等待当前调用结束" : "任务已取消");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "取消任务失败");
    }
  }

  async function handleUpload(items: UploadedItem[]) {
    try {
      const response = await session.uploadFiles(items);
      setStagedItems([]);
      message.success(`已上传 ${response.files.length} 个文件`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "上传失败");
    }
  }

  function handleNewSession() {
    // 模式是主动进入的浏览上下文：新建会话视为离开当前模式，回到普通对话
    setActiveTool(null);
    session.resetSession();
    setTurns([]);
    clearComposerState();
  }

  function handleSwitchSession(threadId: string) {
    const record = getSession(threadId);
    if (!record) {
      return;
    }

    // 刷新后当前会话显示为空欢迎页，此时点击自己的历史项也要恢复内容
    if (threadId === session.threadId && turns.length > 0) {
      return;
    }

    // 与新建会话同理：切换会话即退出当前模式；历史回合的 tool 标签仅作展示
    setActiveTool(null);
    session.switchSession(threadId);
    setTurns(markTurnsIdle(record.turns));
    clearComposerState();
  }

  function handleDeleteSession(threadId: string) {
    removeSession(threadId);
    setSessions(listSessions());

    if (threadId === session.threadId) {
      session.resetSession();
      setTurns([]);
      clearComposerState();
    }
  }

  return (
    <div className="chat-app-shell">
      <Sidebar
        activeMode={activeTool?.mode ?? null}
        currentThreadId={session.threadId}
        health={health}
        sessions={sessions}
        onDeleteSession={handleDeleteSession}
        onActivateTool={(mode) => setActiveTool(getToolModeMeta(mode))}
        onNewSession={handleNewSession}
        onSwitchSession={handleSwitchSession}
      />

      <main className="chat-main">
        {activeTool ? <ToolModeBanner meta={activeTool} onExit={() => setActiveTool(null)} /> : null}

        {session.lastError ? (
          <Alert
            action={
              session.connectionState === "closed" ? (
                <Button size="small" onClick={session.retryNow}>
                  重连
                </Button>
              ) : null
            }
            className="chat-alert"
            message={session.lastError}
            showIcon
            type="error"
          />
        ) : null}

        <section className="chat-stream-panel" ref={streamRef}>
          <ConversationThread
            activeMode={activeTool?.mode ?? null}
            onUseExample={setQuery}
            turns={turns}
          />
        </section>

        <ChatComposer
          isCancelling={session.isCancelling}
          isRunning={session.isRunning}
          isUploading={session.isUploading}
          onCancel={handleCancel}
          onNewSession={handleNewSession}
          onQueryChange={setQuery}
          onStagedItemsChange={setStagedItems}
          onSubmit={handleSubmit}
          onUpload={handleUpload}
          placeholder={activeTool?.placeholder}
          query={query}
          stagedItems={stagedItems}
          uploadedItems={session.uploadedItems}
        />
      </main>
    </div>
  );
}
