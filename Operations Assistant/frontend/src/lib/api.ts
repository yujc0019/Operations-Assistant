import { API_BASE_URL } from "./config";
import type {
  CancelTaskResponse,
  FileListResponse,
  HealthResponse,
  TaskResponse,
  UploadResponse
} from "../types";

const DEFAULT_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 120000;

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function describeNetworkError(error: unknown): string {
  return `无法连接后端服务（${API_BASE_URL}）：${error instanceof Error ? error.message : String(error)}`;
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`请求超过 ${Math.round(timeoutMs / 1000)} 秒未返回，请确认后端服务是否繁忙`);
      }
      throw new Error(describeNetworkError(error));
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload && "detail" in payload
          ? String(payload.detail)
          : `HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>(apiUrl("/api/health"));
}

export async function startTask(
  query: string,
  threadId: string,
  tool: string = "auto"
): Promise<TaskResponse> {
  return requestJson<TaskResponse>(apiUrl("/api/task"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      thread_id: threadId,
      tool
    })
  });
}

export async function cancelTask(threadId: string): Promise<CancelTaskResponse> {
  return requestJson<CancelTaskResponse>(apiUrl(`/api/task/${encodeURIComponent(threadId)}/cancel`), {
    method: "POST"
  });
}

export async function uploadSessionFiles(
  files: File[],
  threadId: string
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("thread_id", threadId);
  files.forEach((file) => formData.append("files", file));

  return requestJson<UploadResponse>(
    apiUrl("/api/upload"),
    {
      method: "POST",
      body: formData
    },
    UPLOAD_TIMEOUT_MS
  );
}

export async function listSessionFiles(path: string): Promise<FileListResponse> {
  const url = new URL(apiUrl("/api/files"));
  url.searchParams.set("path", path);
  return requestJson<FileListResponse>(url);
}

export function getDownloadUrl(path: string): string {
  const url = new URL(apiUrl("/api/download"));
  url.searchParams.set("path", path);
  return url.toString();
}
