/** 时间展示工具：欢迎页消息时间与侧边栏健康检查时间共用一套格式化逻辑 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 无效时间统一返回空串，由调用方决定展示什么占位文案 */
function toDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 时:分，例如 14:08 */
export function formatClock(value: string): string {
  const date = toDate(value);
  if (!date) {
    return "--:--";
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 完整日期时间，例如 2026-09-30 14:08 */
export function formatDateTime(value: string): string {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
