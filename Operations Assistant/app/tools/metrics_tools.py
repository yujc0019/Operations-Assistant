"""
Prometheus 监控查询工具模块

封装监控查询助手使用的 query_prometheus 工具：执行 PromQL 即时/区间查询，
把 Prometheus 兼容 API（覆盖 VictoriaMetrics / Thanos 等）的返回整理成
模型容易阅读的时序摘要。数据源地址与认证头从环境变量读取。
"""

import json
import os
import time
from datetime import datetime
from typing import Annotated, Optional

import requests
from dotenv import load_dotenv
from langchain_core.tools import tool

from app.api.monitor import monitor

load_dotenv()

# 同步 HTTP 查询的超时上限：监控接口正常响应在秒级，10 秒足够覆盖慢查询
QUERY_TIMEOUT_SECONDS = 10

# 区间查询返回的点数上限：原始序列动辄数百点，直接塞给模型会撑爆上下文
MAX_RANGE_POINTS = 60

_NOT_CONFIGURED_MESSAGE = (
    "未配置监控数据源：请在后端 .env 中设置 PROMETHEUS_URL"
    "（Prometheus 兼容 API 地址，例如 http://prometheus:9090）后重启服务再试。"
)


def _load_prometheus_config() -> tuple[Optional[str], dict[str, str]]:
    """
    从环境变量读取监控数据源配置

    :return: (base_url, headers)。PROMETHEUS_URL 未配置时 base_url 为 None；
             PROMETHEUS_HEADERS 是可选的 JSON 对象字符串，用于携带认证头
    """
    base_url = os.getenv("PROMETHEUS_URL", "").strip().rstrip("/")
    headers = {}

    raw_headers = os.getenv("PROMETHEUS_HEADERS", "").strip()
    if raw_headers:
        try:
            parsed = json.loads(raw_headers)
            if isinstance(parsed, dict):
                headers = {str(key): str(value) for key, value in parsed.items()}
        except json.JSONDecodeError:
            # 头配置写错时选择忽略而不是让服务崩溃，问题会在查询失败时暴露
            print("[Metrics] PROMETHEUS_HEADERS 不是合法的 JSON 对象，已忽略")

    return (base_url or None), headers


def _format_instant_result(result_type: str, result: list) -> str:
    """把 instant 查询结果整理成 指标标签 -> 当前值 的清单"""
    if result_type == "scalar":
        return f"标量结果: {result[1]} (时间戳 {result[0]})"

    if result_type == "string":
        return f"字符串结果: {result[1]} (时间戳 {result[0]})"

    if not result:
        return "查询成功但没有返回任何序列（可能指标名或标签过滤写错了）"

    lines = []
    for series in result:
        metric = series.get("metric", {})
        # 去掉 __name__ 之外的展示噪音，保留最有区分度的标签组合
        label_text = ", ".join(
            f"{key}={value}" for key, value in metric.items() if key != "__name__"
        )
        name = metric.get("__name__", "unknown")
        lines.append(f"{name}{{{label_text}}}: {series['value'][1]}")

    return "\n".join(lines)


def _summarize_series(points: list[list]) -> str:
    """把一条区间序列压缩成统计摘要 + 抽样点位，避免输出过长"""
    values = [float(point[1]) for point in points]
    summary = (
        f"点数={len(values)}, 最小={min(values):.4f}, 最大={max(values):.4f}, "
        f"平均={sum(values) / len(values):.4f}, 首值={values[0]:.4f}, 末值={values[-1]:.4f}"
    )

    # 均匀抽样而不是只留前 N 个点，峰值的形状信息才不会丢
    if len(points) > MAX_RANGE_POINTS:
        step = len(points) / MAX_RANGE_POINTS
        sampled = [points[int(i * step)] for i in range(MAX_RANGE_POINTS)]
    else:
        sampled = points

    sample_text = ", ".join(
        f"{point[1]}@{int(float(point[0]))}" for point in sampled
    )
    return f"{summary}\n抽样点位(值@unix时间): {sample_text}"


def _format_range_result(result: list) -> str:
    """把 range 查询结果按序列逐条输出统计摘要"""
    if not result:
        return "查询成功但没有返回任何序列（可能指标名、时间范围或标签过滤写错了）"

    blocks = []
    for series in result:
        metric = series.get("metric", {})
        label_text = ", ".join(
            f"{key}={value}" for key, value in metric.items() if key != "__name__"
        )
        name = metric.get("__name__", "unknown")
        blocks.append(f"{name}{{{label_text}}}\n{_summarize_series(series['values'])}")

    return "\n\n".join(blocks)


def _parse_time_value(value: str, fallback: int) -> int:
    """
    把工具入参的时间解析成 unix 秒

    支持留空（返回 fallback）、unix 秒字符串和 RFC3339/ISO8601 文本；
    解析失败时退回 fallback，避免一个坏时间参数让整个查询报错。
    """
    value = value.strip()
    if not value:
        return fallback
    if value.isdigit():
        return int(value)
    try:
        # 无时区信息的时间按服务器本地时区解释
        return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())
    except ValueError:
        return fallback


@tool
def query_prometheus(
    query: Annotated[str, "PromQL 查询表达式，例如 100 - avg(rate(node_cpu_seconds_total{mode='idle'}[5m])) * 100"],
    mode: Annotated[str, "查询类型：instant（当前值）或 range（时间区间）"] = "instant",
    start: Annotated[
        str, "range 查询起始时间，unix 秒或 RFC3339，留空默认最近1小时"
    ] = "",
    end: Annotated[str, "range 查询结束时间，留空默认当前时间"] = "",
    step: Annotated[str, "range 查询步长，秒数或时间字符串，默认 60"] = "60",
) -> str:
    """
    查询 Prometheus 监控指标数据

    作用：执行 PromQL 表达式并返回结果。
    instant 模式返回各序列当前值；range 模式返回各序列在时间区间内的
    统计摘要（最小/最大/平均/首末值）和抽样点位。
    :param query: PromQL 表达式
    :param mode: instant 或 range
    :param start: range 起始时间，默认 1h 前
    :param end: range 结束时间，默认当前
    :param step: range 步长，默认 60 秒
    :return: 查询结果文本；未配置数据源或查询失败时返回中文提示
    """

    # 埋点：前端时间线展示当前执行的 PromQL 与查询类型
    monitor.report_tool(
        tool_name="监控指标查询工具：query_prometheus",
        args={"query": query, "mode": mode, "start": start, "end": end, "step": step},
    )

    # 先校验查询类型，后面只需处理两种合法取值
    if mode not in ("instant", "range"):
        return f"不支持的查询类型: {mode}，只支持 instant 或 range。"

    base_url, headers = _load_prometheus_config()
    if not base_url:
        return _NOT_CONFIGURED_MESSAGE

    params: dict[str, str] = {"query": query}

    if mode == "instant":
        url = f"{base_url}/api/v1/query"
    else:
        url = f"{base_url}/api/v1/query_range"
        # Prometheus 只接受 unix 秒或 RFC3339；start 留空时从 end 倒推 1 小时，
        # 避免「只传 end」时按 now-1h 取默认值反而晚于 end，造成区间颠倒报错
        now_ts = int(time.time())
        end_ts = _parse_time_value(end, now_ts)
        params["start"] = str(_parse_time_value(start, end_ts - 3600))
        params["end"] = str(end_ts)
        params["step"] = step

    try:
        response = requests.get(url, params=params, headers=headers, timeout=QUERY_TIMEOUT_SECONDS)
    except requests.RequestException as e:
        return f"连接监控数据源失败（{base_url}）：{e}。请确认服务地址与网络连通性。"

    if response.status_code != 200:
        return f"监控数据源返回 HTTP {response.status_code}：{response.text[:500]}"

    try:
        payload = response.json()
    except ValueError:
        return f"监控数据源返回了非 JSON 内容：{response.text[:500]}"

    if payload.get("status") != "success":
        return f"查询执行失败：{payload.get('error', '未知错误')}"

    data = payload.get("data", {})
    result_type = data.get("resultType", "")
    result = data.get("result", [])

    if mode == "range":
        return _format_range_result(result)
    return _format_instant_result(result_type, result)


if __name__ == "__main__":
    # 本地调试入口：直接运行验证数据源连通性与查询结果格式
    print(query_prometheus.invoke({"query": "up", "mode": "instant"}))
