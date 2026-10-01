"""
FastAPI 接口层与项目闭环入口

负责承接前端的任务提交、任务取消、文件上传/下载、输出文件列表查询和
WebSocket 长连接。HTTP 接口只做轻量调度，真正的 DeepAgents 执行放到后台
任务中；执行进度、工具调用和最终结果由 monitor 按 thread_id 推送给前端。
"""

import asyncio
import os
import re
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import List, Literal, Optional

import uvicorn
from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.agent.main_agent import run_deep_agent
from app.api.monitor import manager

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """
    服务生命周期入口。

    启动时绑定当前事件循环到 WebSocket 管理器，确保后台 Agent 任务可以把
    monitor 事件投递回 FastAPI 所在的 loop。
    """
    loop = asyncio.get_running_loop()
    manager.set_loop(loop)
    print(f"[Server] WebSocket Manager bound to loop: {id(loop)}")
    yield


# 当前文件位于 app/api/server.py，运行时目录统一收敛到 app 目录
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent

app = FastAPI(title="DeepAgents API", lifespan=lifespan)

# 保存 thread_id -> 后台 Agent 任务，用于同一会话任务替换和主动取消
active_tasks: dict[str, asyncio.Task] = {}

# output 保存每个会话最终工作区，前端只允许从这里浏览和下载生成文件
output_dir = project_root / "output"
output_dir.mkdir(exist_ok=True)

# 单次文件列表最多返回的条目数；产物很多时靠它限制响应体大小
MAX_LISTED_FILES = 200

# thread_id 会被拼进 updated/output 下的目录名，必须限制字符集；
# 否则 "../x" 这类取值能把会话目录建到 output 之外，绕开下载接口的目录边界
THREAD_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# updated 暂存用户上传文件，run_deep_agent 启动时会复制到对应 output/session_xxx
updated_dir = project_root / "updated"
updated_dir.mkdir(exist_ok=True)

# 前端默认直连 http://localhost:8000，属于跨域请求，所以这里要显式放行 Vite 的开发地址。
# allow_origins=["*"] 与 allow_credentials=True 是 CORS 规范禁止的组合（带凭据的请求
# 不接受通配 Origin），因此改用白名单；换端口或从局域网访问时通过环境变量补充。
cors_allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TaskRequest(BaseModel):
    """前端启动任务时提交的请求体。"""

    query: str
    # 前端可以显式传 null 表示新建会话，因此类型必须允许 None
    thread_id: Optional[str] = None
    # 定向工具模式：auto 走主智能体自由编排，其余值强制路由到对应助手；
    # 用 Literal 让非法取值在请求校验阶段就被 422 拒绝，而不是静默降级
    tool: Literal["auto", "log", "metrics", "command", "kb"] = "auto"


def _check_thread_id(thread_id: str) -> str:
    """
    校验前端提交的 thread_id 是否适合直接拼进文件路径。

    前端默认生成 UUID（见 frontend/src/lib/thread.ts），这里的字符集同时放行
    UUID 和降级格式，拒绝 `..`、`/`、`\\` 等可以改变目录层级的字符。
    """
    if not THREAD_ID_PATTERN.match(thread_id):
        raise HTTPException(
            status_code=400,
            detail="thread_id 只能包含字母、数字、下划线和连字符，且不超过 64 个字符",
        )
    return thread_id


def _forget_task(thread_id: str, task: asyncio.Task) -> None:
    """
    清理已结束任务的登记关系。

    done_callback 触发时，active_tasks 中可能已经被新任务替换；只有仍是同一个
    task 时才删除，避免误清理同 thread_id 下刚启动的新任务。
    """
    if active_tasks.get(thread_id) is task:
        active_tasks.pop(thread_id, None)


@app.get("/api/health")
async def health_check():
    """
    健康检查接口 (Health Check)。

    前端侧边栏的“系统状态”卡片定时轮询本接口判断后端是否可达，
    并展示返回的服务端时间作为最近一次检查时间。
    """
    return {"status": "ok", "time": datetime.now().isoformat(timespec="seconds")}


@app.post("/api/task")
async def run_task(request: TaskRequest):
    """
    启动一次 DeepAgents 后台任务。

    HTTP 请求只负责创建后台协程并立即返回，后续执行轨迹、子智能体调用和最终
    答案都会由 monitor 通过 `/ws/{thread_id}` 推送给同一会话的前端。
    """
    thread_id = _check_thread_id(request.thread_id or str(uuid.uuid4()))

    # 同一个 thread_id 只保留一个活跃任务，新任务会先取消旧任务，避免并发写同一会话目录
    old_task = active_tasks.get(thread_id)
    if old_task and not old_task.done():
        old_task.cancel()

    # create_task 把长耗时 Agent 执行交给事件循环，接口本身不用等待最终结果
    task = asyncio.create_task(run_deep_agent(request.query, thread_id, tool=request.tool))
    active_tasks[thread_id] = task
    task.add_done_callback(lambda finished_task: _forget_task(thread_id, finished_task))

    return {"status": "started", "thread_id": thread_id}


@app.post("/api/task/{thread_id}/cancel")
async def cancel_task(thread_id: str):
    """
    取消指定 thread_id 对应的后台 Agent 任务。

    注意：取消会向 asyncio.Task 注入 CancelledError。若底层第三方工具正在执行不可中断
    的同步阻塞调用，任务可能需要等该调用返回后才会真正结束。
    """
    task = active_tasks.get(thread_id)
    if not task or task.done():
        active_tasks.pop(thread_id, None)
        raise HTTPException(status_code=404, detail="任务不存在或已结束")

    # 先发出取消信号，再短暂等待协程响应；若底层阻塞中，则返回 cancelling 给前端继续展示状态
    task.cancel()
    try:
        await asyncio.wait_for(task, timeout=1.0)
    except asyncio.CancelledError:
        _forget_task(thread_id, task)
        return {"status": "cancelled", "thread_id": thread_id}
    except asyncio.TimeoutError:
        return {"status": "cancelling", "thread_id": thread_id}
    except Exception as e:
        _forget_task(thread_id, task)
        return {"status": "cancelled", "thread_id": thread_id, "message": str(e)}

    _forget_task(thread_id, task)
    return {"status": "cancelled", "thread_id": thread_id}


@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...), thread_id: str = Form(...)):
    """
    文件上传接口 (File Upload)。

    目标：
    1. 接收用户上传的一个或多个文件。
    2. 保存到 `updated/session_{thread_id}` 目录。
    3. 供 Agent 在后续任务中读取和分析。

    Args:
        files (List[UploadFile]): 文件对象列表。
        thread_id (str): 关联的任务会话 ID。
    """
    _check_thread_id(thread_id)

    # 上传文件先按会话隔离保存，避免不同任务读取到彼此的附件
    target_dir = updated_dir / f"session_{thread_id}"
    target_dir.mkdir(parents=True, exist_ok=True)

    saved_files = []
    for file in files:
        # filename 完全由客户端控制，只取最后一段，防止 ../ 或绝对路径写出会话目录
        safe_name = Path(file.filename or "").name
        # pathlib 把 ".." 当作合法文件名，这里一并挡掉
        if safe_name in ("", ".", ".."):
            raise HTTPException(status_code=400, detail="上传文件名无效")

        file_path = target_dir / safe_name
        # 直接复制文件流，避免大文件一次性读入内存
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append(safe_name)

    return {"status": "uploaded", "files": saved_files}


@app.get("/api/download")
async def download_file(path: str):
    """
    文件下载接口 (File Download)。

    目标：
    1. 根据绝对路径下载文件。
    2. 严格的安全检查，防止越权访问。

    Args:
        path (str): 文件的绝对路径 (通常从 list_files 接口获取)。

    失败统一用 HTTP 状态码 + detail 表达（与 /api/task/{id}/cancel 保持一致），
    这样前端只需要 requestJson 一处判断 response.ok 就能拿到可读错误。
    """
    try:
        abs_path = Path(path).resolve()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无效的路径参数: {e}") from e

    # resolve 后再做 is_relative_to，防止 `../` 之类的路径穿越到 output 之外
    if not abs_path.is_relative_to(output_dir.resolve()):
        raise HTTPException(status_code=403, detail="拒绝访问: 只能下载输出目录下的文件")

    if not abs_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")

    # FileResponse 会以流式响应返回文件内容，并让浏览器使用原文件名下载
    return FileResponse(abs_path, filename=abs_path.name)


@app.get("/api/files")
async def list_files(path: str):
    """
    文件列表查询接口 (File Explorer)。

    目标：
    1. 列出指定目录下的生成文件，最新产物排在前面。
    2. 提供文件元数据（大小、修改时间、下载所需路径）。
    3. 与下载接口共用同一条 output 目录安全边界。
    4. 返回条数有上限，避免长时间运行的会话把响应体撑大。

    Args:
        path (str): 目标目录的绝对路径 (必须在 output 目录下)。
    """
    try:
        abs_path = Path(path).resolve()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"路径无效: {e}") from e

    output_abs = output_dir.resolve()
    if not abs_path.is_relative_to(output_abs):
        raise HTTPException(
            status_code=403,
            detail=f"拒绝访问: {abs_path} 不在 {output_abs} 目录下",
        )

    if not abs_path.is_dir():
        raise HTTPException(status_code=404, detail="目录不存在")

    files = []
    try:
        # 递归收集文件元数据；总量仍受 rglob 支配，上限只裁剪响应体
        for file_path in abs_path.rglob("*"):
            if file_path.is_file():
                stat = file_path.stat()
                files.append(
                    {
                        "name": file_path.name,
                        "type": "file",
                        "path": str(file_path),
                        "size": stat.st_size,
                        "mtime": stat.st_mtime,
                    }
                )

    except OSError as e:
        raise HTTPException(status_code=500, detail=f"遍历文件失败: {e}") from e

    # 最新生成的文件排在前面，超出上限时告知前端还有产物未列出
    files.sort(key=lambda item: item["mtime"], reverse=True)

    return {
        "files": files[:MAX_LISTED_FILES],
        "truncated": len(files) > MAX_LISTED_FILES,
    }


@app.websocket("/ws/{thread_id}")
async def websocket_endpoint(websocket: WebSocket, thread_id: str):
    """
    WebSocket 实时通讯核心接口 (Real-time Communication)。

    连接建立后，ConnectionManager 会用 thread_id 保存 WebSocket。monitor 后续
    发送事件时只需要按 thread_id 查找连接，就能把进度推给对应页面。循环中的
    receive_text 用于接收前端心跳，避免连接空闲断开。
    """
    print(f"会话向我们发起了请求，要求建立连接：{thread_id} 对应：{websocket}")

    # 连接建立后立即按 thread_id 注册，monitor 后续才能把事件定向推给当前页面
    await manager.connect(websocket, thread_id)

    try:
        while True:
            # 前端通常发送 ping 心跳；服务端回复 pong，顺便维持连接活跃
            data = await websocket.receive_text()
            await websocket.send_json(
                {"type": "pong", "message": f"服务端已收到: {data}"}
            )

    except WebSocketDisconnect:
        # 只移除当前 WebSocket 实例，避免旧连接断开时误删同 thread_id 的新连接
        manager.disconnect(websocket, thread_id)
        print(f"[WebSocket] 客户端已断开: {thread_id}")

    except Exception as e:
        print(f"[WebSocket] 连接异常: {e}")
        manager.disconnect(websocket, thread_id)


if __name__ == "__main__":
    # 导入串必须是 app.api.server（相对项目根），且从项目根用 python -m app.api.server
    # 启动；直接 python app/api/server.py 会让 app 包不在 sys.path 上而导入失败。
    # 日常开发仍推荐 README 里的 uv run uvicorn app.api.server:app --reload。
    uvicorn.run("app.api.server:app", host="0.0.0.0", port=8000, reload=True)
