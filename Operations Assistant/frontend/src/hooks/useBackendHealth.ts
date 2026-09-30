import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";
import { formatDateTime } from "../lib/datetime";

const HEALTH_CHECK_INTERVAL_MS = 30000;

export interface BackendHealth {
  /** 最近一次健康检查是否通过 */
  ok: boolean;
  /** 最近一次检查时间的展示文案；尚未检查成功时为空串 */
  checkedLabel: string;
}

/**
 * 侧边栏“系统状态”数据源：定时轮询后端 /api/health
 * 组件卸载或后端不可达时保持最近一次结果，并展示检查时间
 */
export function useBackendHealth(): BackendHealth {
  const [health, setHealth] = useState<BackendHealth>({ ok: false, checkedLabel: "" });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const response = await fetchHealth();
        if (!cancelled) {
          setHealth({ ok: response.status === "ok", checkedLabel: formatDateTime(response.time) });
        }
      } catch {
        if (!cancelled) {
          setHealth({ ok: false, checkedLabel: formatDateTime(new Date().toISOString()) });
        }
      }
    }

    void check();
    const timer = window.setInterval(check, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return health;
}
