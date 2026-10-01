"""
命令助手子智能体配置模块

将 app/prompt/prompts.yml 中的 command 配置与命令库检索工具组装成
DeepAgents 可识别的字典式子智能体。只查询和讲解命令，不执行命令。
"""

from app.agent.prompts import sub_agents_content
from app.tools.command_tools import search_commands

# 命令助手必须先检索内置命令库，命中则严格按库内容回答并给风险提示
command_assistant_agent = {
    "name": sub_agents_content["command"]["name"],
    "description": sub_agents_content["command"]["description"],
    "system_prompt": sub_agents_content["command"]["system_prompt"],
    "tools": [search_commands],
}
