"""
监控查询子智能体配置模块

将 app/prompt/prompts.yml 中的 metrics 配置与 Prometheus 查询工具组装成
DeepAgents 可识别的字典式子智能体。负责把自然语言指标需求转成 PromQL
并解读查询结果。
"""

from app.agent.prompts import sub_agents_content
from app.tools.metrics_tools import query_prometheus

# 监控助手必须"先确认指标名、再查数据"：instant 看当前值，range 看趋势
metrics_query_agent = {
    "name": sub_agents_content["metrics"]["name"],
    "description": sub_agents_content["metrics"]["description"],
    "system_prompt": sub_agents_content["metrics"]["system_prompt"],
    "tools": [query_prometheus],
}
