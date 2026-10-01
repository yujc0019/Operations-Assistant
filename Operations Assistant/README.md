<div align='center'>
  <h1 style="margin-top: 15px;">「运维问答助手」多智能体运维问答系统</h1>
  <h4><b>ops-assistant</b></h4>
  <p><em>基于 DeepAgents 的运维问答实战项目：主智能体协调网络搜索助手与 RAGFlow 知识库助手，围绕故障排查、日志分析、命令配置、知识问答等运维场景给出专业解答，支持 Markdown / PDF 交付与前后端实时联动</em></p>
</div>

<div align='center'>

![AI](https://img.shields.io/badge/AI-Agent-00c853?style=flat)
![DeepAgents](https://img.shields.io/badge/DeepAgents-0.5.7-1C3C3C.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-WebSocket-009688.svg?logo=fastapi&logoColor=white)

</div>

## 📖 项目介绍

在真实运维场景里，一个问题经常不是一句普通问答可以解决的。

比如：

```text
服务器 CPU 持续过高，结合内部运维手册和公开资料，整理一份排查报告并生成 PDF。
```

这个问题背后可能包含多类动作：

- 判断需要公开资料、私有知识库还是本次上传文件；
- 去互联网搜索技术文档、厂商公告、社区方案和行业最佳实践；
- 到 RAGFlow 查询内部运维手册、故障处置预案、变更流程等非结构化文档；
- 读取用户上传的 PDF、Word、Excel、Markdown、日志或文本文件；
- 汇总多来源信息，判断资料是否足够；
- 生成 Markdown 报告，并在需要时转换成 PDF；
- 把执行过程、最终结果和生成文件实时展示给前端。

所以「运维问答助手」更像一个会分工、会查资料、会生成交付物的运维助手。用户只需要提出问题，系统会在后端组织一条可观察的多智能体执行链路。

```text
用户问题
  -> FastAPI 接口接收请求
  -> run_deep_agent 创建会话目录并写入上下文
  -> 主智能体分析问题
  -> 分派给网络搜索助手 / RAGFlow 助手
  -> 主智能体汇总多来源信息
  -> 调用文件工具生成 Markdown / PDF
  -> monitor 通过 WebSocket 推送进度
  -> 前端展示事件、答案和文件列表
```

## ✨ 项目亮点

- **一主两从的多智能体架构**
  - 主智能体负责理解问题、规划步骤、调度助手和最终汇总。
  - 网络搜索助手、RAGFlow 助手分别处理不同信息来源。
- **多来源检索，而不是模型裸答**
  - `Tavily` 负责互联网公开资料检索。
  - `RAGFlow` 负责查询内部非结构化文档。
  - 上传附件由主智能体通过文件工具读取。
- **定向工具模式**
  - 侧边栏四个常用工具（日志分析/监控查询/命令助手/知识库）各自是独立的对话模式，后端把问题定向路由给对应助手；
  - 监控查询走真实 Prometheus 数据（PromQL 即时/区间查询）；命令助手检索内置命令库（含风险等级），未命中时由 AI 生成并标注提醒；
- **对话式运维问答前端**
  - 欢迎页内置故障排查、日志分析、配置命令、知识问答等示例问题，一键预填；
  - 对话历史保存在浏览器本地，可随时回看和继续提问。
- **从检索到交付的完整可运行链路**
  - 不停留在 Prompt 设计，而是会真实调用工具、读取数据、生成 Markdown，并在需要时转换成 PDF。
- **长任务执行过程可观察**
  - 工具调用、子智能体调用、工作目录创建、任务结果、取消和异常都会通过 `monitor` 推送到前端。
- **会话级上下文隔离**
  - 通过 `thread_id` 和 `session_dir` 区分不同任务，`ContextVar` 让深层工具也能拿到当前会话身份和文件目录。
- **工程化前后端结构清晰**
  - 基于 `FastAPI + WebSocket + DeepAgents + React` 组织健康检查、任务接口、异步执行、事件推送、文件上传和文件下载。

这个项目适合这些场景：

- 想系统学习 `DeepAgents`，但不想只停留在几个玩具示例。
- 想把 `Tavily`、`RAGFlow` 和大模型放到同一个运维问答场景里理解。
- 想要一个可以直接部署给运维团队使用的智能问答助手原型。
- 想把项目写进简历，并且能说清楚智能体层、工具层、服务层、文件层和前端层分别做了什么。

## 🏗️ 系统架构

项目采用 DeepAgents 中典型的 Orchestrator-Workers 模式：主智能体作为调度中心，两个专家助手负责信息获取，文件工具由主智能体直接掌握。

```text
用户交互层      React + Vite 前端（对话 / 上传 / 文件列表）
                  │ HTTP 命令通道           WebSocket 进度通道
API 通信层      FastAPI server.py（健康检查 / 任务 / 上传 / 下载 / ConnectionManager）
                  │
调度层          main_agent.py + run_deep_agent + ContextVar + monitor.py
                  │
子智能体与工具层  网络搜索助手(Tavily) │ RAGFlow 助手(知识库问答) │ 文件交付工具(MD/PDF)
                  │
数据与产物层    公开网页 / RAGFlow 知识库 / updated/session 上传 / output 产物
```

项目围绕两条主线展开：

| 主线             | 做什么                                                       | 涉及模块                                                        |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| 多智能体运维问答 | 基于用户问题完成规划、分派、检索、读取附件、汇总和生成交付物 | `DeepAgents` / `LangChain` / `LangGraph` / `Tavily` / `RAGFlow` |
| 前后端实时闭环   | 启动后台任务、上传文件、推送执行过程、展示结果和下载生成文件 | `FastAPI` / `WebSocket` / `React` / `Vite`                      |

### 智能体与工具

| 归属           | 能力                                     | 工具                                                          |
| -------------- | ---------------------------------------- | ------------------------------------------------------------- |
| 主智能体       | 任务规划、助手调度、结果汇总、文件交付   | `read_file_content`、`generate_markdown`、`convert_md_to_pdf` |
| 网络搜索助手   | 查询互联网公开信息、新闻、政策和网页资料 | `internet_search`                                             |
| RAGFlow 助手   | 发现可用知识库助手，并向内部知识库提问   | `get_assistant_list`、`create_ask_delete`                     |
| 监控查询助手   | 自然语言转 PromQL，查询监控指标与趋势    | `query_prometheus`                                            |
| 命令助手       | 检索内置命令库，讲解命令与操作步骤       | `search_commands`                                             |

## 🛠️ 项目技术栈

| 模块           | 技术                                             | 作用                                                                          |
| -------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| 智能体框架     | `DeepAgents`                                     | 创建主智能体和子智能体，承接长任务、多工具、多助手调度                        |
| 图与检查点     | `LangGraph`                                      | 提供底层运行时和 `InMemorySaver` 会话检查点                                   |
| 模型与工具抽象 | `LangChain` / `langchain-core`                   | 封装 OpenAI 兼容模型、工具声明和 Agent 调用结构                               |
| 大模型接入     | OpenAI 兼容接口                                  | 通过 `.env` 中的 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` 接入模型 |
| 网络搜索       | `Tavily`                                         | 为网络搜索助手提供公开资料检索                                                |
| 私有知识库     | `RAGFlow` / `ragflow-sdk`                        | 为知识库助手提供内部文档问答能力                                              |
| 文件处理       | `pypdf` / `python-docx` / `pandas` / `ReportLab` | 读取上传附件，生成 Markdown，转换 PDF                                         |
| 后端接口       | `FastAPI` / `Uvicorn`                            | 提供健康检查、任务、取消、上传、文件列表、下载和 WebSocket 接口               |
| 实时通信       | `WebSocket`                                      | 推送工具调用、助手调用、最终结果和错误事件                                    |
| 前端           | `React` / `Vite` / `Ant Design` / `Tailwind CSS` | 提供对话式问答界面、对话历史、常用工具和系统状态展示                          |
| 依赖管理       | `uv` / `pnpm`                                    | 管理 Python 后端和前端依赖                                                    |

## 📁 项目结构

```text
ops-assistant/
├── app/
│   ├── agent/
│   │   ├── subagents/              # 网络搜索、RAGFlow、监控查询、命令助手四个子智能体
│   │   ├── llm.py                  # OpenAI 兼容模型初始化
│   │   ├── main_agent.py           # 主智能体组装与 run_deep_agent 执行入口
│   │   └── prompts.py              # 读取 app/prompt/prompts.yml
│   ├── api/
│   │   ├── context.py              # ContextVar 保存 thread_id 和 session_dir
│   │   ├── monitor.py              # 工具调用、助手调用、结果和异常事件推送
│   │   └── server.py               # FastAPI 健康检查、任务、上传、文件、下载、WebSocket 接口
│   ├── prompt/
│   │   ├── prompts.yml             # 主智能体和子智能体提示词配置
│   │   └── commands.yml            # 内置运维命令库（命令助手数据源）
│   ├── ragflow/                    # RAGFlow 配置和基础调用示例
│   ├── tools/                      # Tavily、RAGFlow、监控查询、命令库检索、文件读取、Markdown、PDF 工具
│   ├── utils/                      # 路径解析、Markdown/PDF 底层转换等普通 Python 工具
│   ├── output/                     # 运行时生成：每个会话的 Markdown、PDF 等产物
│   └── updated/                    # 运行时生成：用户上传文件的会话暂存目录
├── docs/knowledge_base/            # RAGFlow 示例文档本地目录（可放入自己的 PDF）
├── frontend/                       # React + Vite 前端项目
├── .env.example                    # 环境变量示例
├── pyproject.toml                  # Python 项目依赖声明
├── requirements.txt                # 依赖清单
├── .pre-commit-config.yaml         # 提交前钩子
└── uv.lock                         # uv 锁定文件
```

## 🚀 快速开始

### 1. 准备环境

- Python `3.12`
- `uv`
- Node.js 与 `pnpm`
- 可用的大模型 API Key
- Tavily API Key
- RAGFlow 服务与 API Key

### 2. 获取项目

```bash
git clone <本仓库地址> ops-assistant
cd ops-assistant
```

### 3. 安装后端依赖

```bash
uv sync
```

### 4. 配置环境变量

```bash
cp .env.example .env
```

按本机实际服务和密钥修改 `.env`：

```bash
# LLM 配置（OpenAI 兼容协议，BASE_URL 可换成任意兼容服务）
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_API_KEY=你的大模型_API_KEY
DEEPSEEK_MODEL=deepseek-v4-flash

# Tavily 配置
TAVILY_API_KEY=你的_TAVILY_API_KEY

# RAGFlow 配置
RAGFLOW_API_URL=http://your-ragflow-host
RAGFLOW_API_KEY=ragflow-your-api-key

# Prometheus 监控配置（Prometheus 兼容 API，VictoriaMetrics / Thanos 也可）
# 未配置时「监控查询」工具会提示数据源未配置，其余功能不受影响
PROMETHEUS_URL=http://prometheus:9090
# 可选：需要认证时填写 JSON 对象字符串，例如 {"Authorization": "Bearer xxx"}
PROMETHEUS_HEADERS=
```

### 5. 准备 RAGFlow 知识库

RAGFlow 不随本仓库一起部署，需要接入你已有的 RAGFlow 服务，或自行部署。准备好内部运维手册、故障处置预案等文档并导入 RAGFlow 知识库，创建对应的聊天助手。

如果暂时不使用私有知识库能力，也可以先跑网络搜索和上传文件读取链路；只有问题触发 RAGFlow 助手时才会依赖 `RAGFLOW_API_URL` 和 `RAGFLOW_API_KEY`。

### 6. 启动后端

```bash
uv run uvicorn app.api.server:app --host 0.0.0.0 --port 8000 --reload
```

后端默认接口：

| 接口                                | 说明                                   |
| ----------------------------------- | -------------------------------------- |
| `GET /api/health`                   | 健康检查，返回服务状态与服务端时间     |
| `POST /api/task`                    | 启动一次 DeepAgents 后台任务           |
| `POST /api/task/{thread_id}/cancel` | 取消指定会话任务                       |
| `POST /api/upload`                  | 上传一个或多个文件到当前会话           |
| `GET /api/files`                    | 列出当前会话输出目录中的生成文件       |
| `GET /api/download`                 | 下载输出目录中的文件                   |
| `WebSocket /ws/{thread_id}`         | 推送工具调用、助手调用、结果和异常事件 |

### 7. 启动前端

```bash
cd frontend
pnpm install
pnpm dev
```

前端默认连接：

```text
API: http://localhost:8000
WS:  ws://localhost:8000
```

如需修改，可以在 `frontend/.env.local` 中配置：

```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
```

## 🚧 能力边界

「运维问答助手」适合作为多智能体运维问答的原型和工程学习项目，但它不是一个完整企业级生产系统。当前版本重点覆盖 DeepAgents 多智能体调度、真实工具接入、文件交付、FastAPI 接口、WebSocket 实时推送和前后端联调。

它没有刻意展开以下能力：

- 用户登录、角色权限和多租户隔离；
- 对话历史目前保存在浏览器 localStorage，后端不持久化消息，跨浏览器/设备不可见；
- 任务队列、分布式执行和大规模并发治理；
- 全量事件持久化、审计追踪；
- 系统化评测集、自动化回归和 Agent 质量评估；
- 生产监控、告警、链路追踪和灰度发布；
- 复杂报告编辑、协同工作流和权限化文件管理。

这些能力适合在主链路跑通之后继续扩展。本仓库先承担一个清晰角色：把多智能体运维问答项目最关键、最必要、最值得学习的工程骨架跑起来，并为后续企业级扩展打基础。
