"""
文件路径解析工具

负责把模型或工具返回的虚拟路径、上传文件路径和相对路径统一转换为本地绝对路径
后续文件读取、Markdown 生成和 PDF 转换工具都可以复用这里的解析规则

解析规则按三条边界划分，resolve_path 也按这个顺序依次尝试：
1. 含 updated/ 的上传文件路径 -> 只能落在 app/updated 内
2. 绝对路径 -> 会话目录之外保持原样，之内则纠正重复嵌套
3. 其余相对路径 -> 一律限制在当前会话目录内
"""

import os
from pathlib import Path
from typing import Optional

# 当前文件位于 app/utils/path_utils.py，parents[1] 即 app 目录
app_root_path = Path(__file__).parents[1].resolve()

# 用户上传文件的落地目录（见 api/server.py），updated/ 前缀只允许解析到它内部
updated_root = (app_root_path / "updated").resolve()

# 大模型常返回的沙箱路径前缀，本地项目需要先剥离
SANDBOX_PREFIXES = ("/workspace", "/mnt/data", "/home/user")


def resolve_path(filename: str, session_dir: Optional[str] = None) -> str:
    """
    解析文件路径，并尽量把任务产物限制在当前会话目录中

    :param filename: 模型、工具或用户传入的文件名/路径
    :param session_dir: 当前任务的会话目录
    :return: 解析后的绝对路径
    """
    # 先把 Windows 反斜杠统一成 /，后续的前缀判断都按 / 来做
    path = _strip_sandbox_prefix(filename.replace("\\", "/"))
    path_str = str(path).replace("\\", "/")

    uploaded_path = _resolve_updated_path(path_str)
    if uploaded_path is not None:
        return uploaded_path

    # 脚本直跑、没有会话目录时，退化成按当前工作目录解析
    if not session_dir:
        return str(path.resolve())

    session_path = Path(session_dir).resolve()

    if _looks_absolute(path, path_str):
        return _resolve_absolute(path, path_str, session_path)

    return _resolve_relative(path, session_path)


def _strip_sandbox_prefix(path_str: str) -> Path:
    """
    剥离 /workspace 这类沙箱前缀

    模型经常把沙箱里的绝对路径原样抄回来，这些目录在本机并不存在。
    :param path_str: 分隔符已统一为 / 的原始路径
    :return: 剥离前缀后的 Path
    """
    for prefix in SANDBOX_PREFIXES:
        if path_str.startswith(prefix):
            # 只剩前缀本身时 cleaned 为空，Path("") 等价于 Path(".")
            return Path(path_str[len(prefix) :].lstrip("/"))
    return Path(path_str)


def _resolve_updated_path(path_str: str) -> Optional[str]:
    """
    解析用户上传文件的路径

    上传附件存放在 app/updated/session_xxx，读取时需要绕过会话目录直接定位过去。
    :param path_str: 分隔符已统一为 / 的路径
    :return: 命中 updated/ 前缀时返回绝对路径，否则返回 None
    """
    if "updated/" not in path_str:
        return None

    uploaded_path = (app_root_path / path_str[path_str.find("updated/") :]).resolve()
    # 挡掉 "updated/../../x" 这类回退写法
    if not uploaded_path.is_relative_to(updated_root):
        raise ValueError(f"非法的上传文件路径: {path_str}")
    return str(uploaded_path)


def _looks_absolute(path: Path, path_str: str) -> bool:
    """
    判断这条路径要不要按绝对路径处理

    Windows 上 Path("/x.md") 因为缺少盘符并不被视为绝对路径，但模型写出 /x.md
    时表达的就是"从根写起"；这里把它一并交给 _resolve_absolute，由那里折算到
    会话目录内。POSIX 下的 /x.md 则按真正的绝对路径处理。
    """
    return path.is_absolute() or (os.name == "nt" and path_str.startswith("/"))


def _resolve_absolute(path: Path, path_str: str, session_path: Path) -> str:
    """
    解析绝对路径：会话目录之外保持原样，之内则纠正重复嵌套
    """
    if os.name == "nt" and path_str.startswith("/") and not path.drive:
        # Windows 下 "/xxx" 没有盘符，按会话目录内的相对路径处理
        full_path = session_path / path_str.lstrip("/")
    else:
        full_path = path.resolve()

    if _is_inside_session(full_path, session_path):
        return str(_fix_nested_session_path(full_path, session_path))

    # 真实绝对路径且不在 session_dir 中时保持原样，避免误改外部资源路径
    return str(full_path)


def _is_inside_session(full_path: Path, session_path: Path) -> bool:
    """
    判断路径是否就是会话目录本身，或位于会话目录之中
    """
    return full_path == session_path or session_path in full_path.parents


def _fix_nested_session_path(full_path: Path, session_path: Path) -> Path:
    """
    修正 session_xxx/session_xxx/file.md 这类重复嵌套路径
    """
    parts = full_path.parts
    session_name = session_path.name
    for index in range(len(parts) - 1):
        if parts[index] == session_name and parts[index + 1] == session_name:
            return session_path / full_path.name
    return full_path


def _resolve_relative(path: Path, session_path: Path) -> str:
    """
    解析相对路径，结果一定落在会话目录内
    """
    # 先剥掉 ../ 段，否则 "../../../.env" 可以读出工作目录之外
    parts = tuple(part for part in path.parts if part != "..")
    if not parts:
        return str(session_path)

    # 模型常把 output 或会话目录名重复拼进路径，这时只取文件名重新落回会话目录
    if session_path.name in parts or parts[0] == "output":
        return str(session_path / path.name)

    return str(session_path / Path(*parts))
