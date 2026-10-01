"""
运维命令库查询工具模块

封装命令助手使用的 search_commands 工具：在 app/prompt/commands.yml
内置命令库中按关键词/场景检索命令，返回带风险等级的结构化结果。
本工具只做查询，不执行任何命令。
"""

import re
from pathlib import Path
from typing import Annotated

import yaml
from langchain_core.tools import tool

from app.api.monitor import monitor

# 当前文件位于 app/tools/，parents[1] 即 app 目录
COMMANDS_FILE = Path(__file__).parents[1] / "prompt" / "commands.yml"

# 返回给模型的最大条数：命中过多时截断，避免撑爆上下文
MAX_RESULTS = 8

# 模块加载时读取一次即可；命令库是随仓库静态维护的，不需要热更新
try:
    with open(COMMANDS_FILE, "r", encoding="utf-8") as f:
        _command_entries = yaml.safe_load(f).get("commands", [])
except (OSError, yaml.YAMLError) as e:
    print(f"[Commands] 命令库加载失败，search_commands 将返回空结果: {e}")
    _command_entries = []


def _tag_in_word(tag: str, word: str) -> bool:
    """
    判断一个标签是否命中关键词片段

    含中文的标签用子串匹配（中文没有空格分词，"端口"应能命中"查看端口占用"）；
    纯 ASCII 标签要求词边界匹配，避免 "df" 误命中 "导出pdf"、"top" 误命中 "stop"；
    其中长度不足 3 的 ASCII 标签只做整词相等，进一步压缩误命中面。
    """
    if tag.isascii():
        if len(tag) < 3:
            return tag == word
        pattern = rf"(?<![a-z0-9]){re.escape(tag)}(?![a-z0-9])"
        return re.search(pattern, word) is not None
    return tag in word


def _match_score(entry: dict, keyword: str) -> int:
    """
    计算关键词与单条命令的匹配强度

    优先级：场景完全包含 > 标签命中 > 命令本体包含 > 描述包含。
    返回 0 表示不匹配。
    """
    keyword_lower = keyword.lower()
    scene = entry.get("scene", "").lower()
    tags = [str(tag).lower() for tag in entry.get("tags", [])]
    command = entry.get("command", "").lower()
    description = entry.get("description", "").lower()

    if keyword_lower in scene:
        return 4
    if any(_tag_in_word(tag, keyword_lower) for tag in tags):
        return 3
    if keyword_lower in command:
        return 2
    if keyword_lower in description:
        return 1
    return 0


def _format_entry(entry: dict) -> str:
    """把单条命令整理成模型容易引用的文本块"""
    return (
        f"[{entry.get('category', '未分类')}] {entry.get('scene', '')}\n"
        f"命令: {entry.get('command', '')}\n"
        f"说明: {entry.get('description', '')}\n"
        f"风险等级: {entry.get('risk', 'unknown')} | 示例: {entry.get('example', '')}"
    )


@tool
def search_commands(
    keyword: Annotated[str, "检索关键词或场景描述，例如 '端口占用'、'重启 nginx'、'k8s pod 日志'"],
) -> str:
    """
    在内置运维命令库中检索命令

    作用：按场景、标签、命令或说明匹配常用运维命令，返回命令本体、
    参数说明、风险等级和示例。库中没有命中时会如实返回未命中提示。
    :param keyword: 用户的场景描述或关键词
    :return: 匹配的命令列表文本；无命中时返回提示模型自行生成并标注
    """

    monitor.report_tool(
        tool_name="运维命令库检索工具：search_commands",
        args={"keyword": keyword},
    )

    if not _command_entries:
        return "命令库当前为空或加载失败，请基于自身知识回答，并明确标注「AI 生成，执行前请核实」。"

    # 多词关键词（如 "k8s pod 日志"）拆词后要求每个词都命中同一命令
    words = [word for word in keyword.lower().split() if word]
    if not words:
        return "请提供要检索的场景关键词，例如「端口占用」「查看内存」。"

    scored: list[tuple[int, dict]] = []
    for entry in _command_entries:
        scores = [_match_score(entry, word) for word in words]
        if all(score > 0 for score in scores):
            scored.append((sum(scores), entry))

    if not scored:
        return (
            f"命令库中没有匹配「{keyword}」的条目。"
            "请基于自身知识生成命令和步骤，并必须在回答开头标注："
            "「以下命令由 AI 生成，库中未收录，执行前请务必核实」。"
        )

    scored.sort(key=lambda pair: pair[0], reverse=True)
    matched = [entry for _, entry in scored[:MAX_RESULTS]]
    total = len(scored)

    header = f"命中 {total} 条（按相关度排序，最多展示 {MAX_RESULTS} 条）："
    return "\n\n".join([header, *[_format_entry(entry) for entry in matched]])


if __name__ == "__main__":
    # 本地调试入口：验证命令库加载与检索效果
    print(search_commands.invoke({"keyword": "端口占用"}))
    print("---")
    print(search_commands.invoke({"keyword": "k8s pod 日志"}))
