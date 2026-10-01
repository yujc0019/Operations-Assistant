import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelTask, listSessionFiles, startTask, uploadSessionFiles } from "../lib/api";
import { WS_BASE_URL } from "../lib/config";
import { createThreadId, getStoredThreadId, storeThreadId } from "../lib/thread";
import type {
  ConnectionState,
  MonitorMessage,
  OutputFile,
  SocketMessage,
  UploadedItem
} from "../types";

const MAX_EVENTS = 120;
const FILE_POLL_INTERVAL_MS = 2500;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15000;
const RECONNECT_MAX_ATTEMPTS = 8;

function extractString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" ? value : null;
}

export function useDeepAgentSession() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const heartbeatTimerRef = useRef<number | undefined>(undefined);
  const uploadedNameSetRef = useRef<Set<string>>(new Set());
  const reconnectAttemptsRef = useRef(0);
  const [threadId, setThreadId] = useState(getStoredThreadId);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [events, setEvents] = useState<MonitorMessage[]>([]);
  const [files, setFiles] = useState<OutputFile[]>([]);
  const [filesTruncated, setFilesTruncated] = useState(false);
  const [sessionPath, setSessionPath] = useState("");
  const [result, setResult] = useState("");
  const [lastError, setLastError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);

  const clearSocketTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
    }
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = undefined;
    }
  }, []);

  /** 采纳一个 thread_id：清空上一会话的流式状态，WS 会因 threadId 变化自动重连 */
  const adoptThread = useCallback((nextThreadId: string) => {
    storeThreadId(nextThreadId);
    reconnectAttemptsRef.current = 0;
    setThreadId(nextThreadId);
    setEvents([]);
    setFiles([]);
    setFilesTruncated(false);
    setSessionPath("");
    setResult("");
    setLastError("");
    setUploadedItems([]);
    uploadedNameSetRef.current.clear();
    setIsRunning(false);
    setIsCancelling(false);
  }, []);

  const resetSession = useCallback(() => {
    adoptThread(createThreadId());
  }, [adoptThread]);

  /** 切换到已有会话（对话历史点击时调用）；同会话重复点击不产生任何副作用 */
  const switchSession = useCallback(
    (nextThreadId: string) => {
      if (nextThreadId !== threadId) {
        adoptThread(nextThreadId);
      }
    },
    [adoptThread, threadId]
  );

  const retryNow = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setLastError("");
    setReconnectNonce((previous) => previous + 1);
  }, []);

  const refreshFiles = useCallback(async () => {
    if (!sessionPath) {
      return;
    }

    const response = await listSessionFiles(sessionPath);
    setFiles(response.files);
    setFilesTruncated(response.truncated);
  }, [sessionPath]);

  useEffect(() => {
    let disposed = false;

    function connect() {
      clearSocketTimers();
      const hadSocket = Boolean(socketRef.current);
      socketRef.current?.close();
      setConnectionState(hadSocket ? "reconnecting" : "connecting");

      const socket = new WebSocket(`${WS_BASE_URL}/ws/${encodeURIComponent(threadId)}`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) {
          return;
        }
        reconnectAttemptsRef.current = 0;
        setConnectionState("connected");
        setLastError("");
        heartbeatTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        if (socketRef.current !== socket) {
          return;
        }
        try {
          const payload = JSON.parse(event.data) as SocketMessage;
          if (payload.type === "pong") {
            return;
          }

          if (payload.type !== "monitor_event") {
            return;
          }

          setEvents((previous) => [...previous, payload].slice(-MAX_EVENTS));

          if (payload.event === "session_created") {
            const path = extractString(payload.data, "path");
            if (path) {
              setSessionPath(path);
            }
          }

          if (payload.event === "task_result") {
            const finalResult = extractString(payload.data, "result");
            setResult(finalResult || payload.message);
            setIsRunning(false);
            setIsCancelling(false);
          }

          if (payload.event === "task_cancelled") {
            setResult((previous) => previous || payload.message);
            setIsRunning(false);
            setIsCancelling(false);
          }

          if (payload.event === "error") {
            setLastError(payload.message);
            setIsRunning(false);
            setIsCancelling(false);
          }
        } catch (error) {
          setLastError(error instanceof Error ? error.message : "WebSocket 消息解析失败");
        }
      };

      socket.onerror = () => {
        if (!disposed && socketRef.current === socket) {
          setLastError("WebSocket 连接异常，请确认后端服务已启动");
        }
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) {
          return;
        }
        clearSocketTimers();
        if (disposed) {
          setConnectionState("closed");
          return;
        }

        if (reconnectAttemptsRef.current >= RECONNECT_MAX_ATTEMPTS) {
          setConnectionState("closed");
          setLastError("WebSocket 重连次数已用尽，请确认后端服务已启动后手动重连");
          return;
        }

        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptsRef.current,
          RECONNECT_MAX_DELAY_MS
        );
        reconnectAttemptsRef.current += 1;
        setConnectionState("reconnecting");
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      clearSocketTimers();
      socketRef.current?.close();
    };
  }, [clearSocketTimers, reconnectNonce, threadId]);

  useEffect(() => {
    if (!sessionPath) {
      return;
    }

    const refresh = () => {
      refreshFiles().catch((error: unknown) => {
        setLastError(error instanceof Error ? error.message : "文件列表刷新失败");
      });
    };

    // 进入/退出运行状态时先立即同步一次，最终产物不必等下一轮轮询
    refresh();

    if (!isRunning) {
      return;
    }

    const timer = window.setInterval(refresh, FILE_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isRunning, refreshFiles, sessionPath]);

  const submitTask = useCallback(
    async (query: string, tool: string = "auto") => {
      const cleanQuery = query.trim();
      if (!cleanQuery) {
        throw new Error("请输入运维问题");
      }

      setIsRunning(true);
      setIsCancelling(false);
      setEvents([]);
      setResult("");
      setLastError("");
      try {
        const response = await startTask(cleanQuery, threadId, tool);
        if (response.thread_id && response.thread_id !== threadId) {
          storeThreadId(response.thread_id);
          setThreadId(response.thread_id);
        }
        return response;
      } catch (error) {
        setIsRunning(false);
        setIsCancelling(false);
        throw error;
      }
    },
    [threadId]
  );

  const cancelCurrentTask = useCallback(async () => {
    if (!isRunning) {
      throw new Error("当前没有正在执行的任务");
    }

    setIsCancelling(true);
    setLastError("");
    try {
      const response = await cancelTask(threadId);
      if (response.status === "cancelled") {
        setIsRunning(false);
        setIsCancelling(false);
        setResult((previous) => previous || "任务已取消");
      }
      return response;
    } catch (error) {
      setIsCancelling(false);
      throw error;
    }
  }, [isRunning, threadId]);

  const uploadFiles = useCallback(
    async (items: UploadedItem[]) => {
      if (items.length === 0) {
        throw new Error("请选择要上传的文件");
      }

      const nextItems = items.filter((item) => !uploadedNameSetRef.current.has(item.name));

      if (nextItems.length === 0) {
        return {
          status: "uploaded",
          files: Array.from(uploadedNameSetRef.current)
        };
      }

      // 先占位再发请求，避免上传途中重复点击把同一文件再发一次
      nextItems.forEach((item) => uploadedNameSetRef.current.add(item.name));

      setIsUploading(true);
      setLastError("");
      try {
        const response = await uploadSessionFiles(
          nextItems.map((item) => item.raw),
          threadId
        );
        setUploadedItems((previous) => [...previous, ...nextItems]);
        return response;
      } catch (error) {
        // 失败要退回占位，否则同名文件永远无法重试
        nextItems.forEach((item) => uploadedNameSetRef.current.delete(item.name));
        throw error;
      } finally {
        setIsUploading(false);
      }
    },
    [threadId]
  );

  const stats = useMemo(() => {
    const toolEvents = events.filter((event) => event.event === "tool_start").length;
    const assistantEvents = events.filter((event) => event.event === "assistant_call").length;
    const errorEvents = events.filter((event) => event.event === "error").length;

    return {
      toolEvents,
      assistantEvents,
      errorEvents
    };
  }, [events]);

  return {
    connectionState,
    events,
    files,
    filesTruncated,
    isCancelling,
    isRunning,
    isUploading,
    lastError,
    resetSession,
    result,
    retryNow,
    stats,
    cancelCurrentTask,
    submitTask,
    switchSession,
    threadId,
    uploadFiles,
    uploadedItems
  };
}
