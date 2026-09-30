"""
大模型初始化模块

负责从 .env 中读取模型配置，并创建项目统一复用的模型对象
后续主智能体和子智能体都从这里导入 model，避免在多个文件里重复加载环境变量
"""

import os

from dotenv import find_dotenv, load_dotenv
from langchain.chat_models import init_chat_model

# find_dotenv 会从当前目录向上查找 .env，适合脚本和 Web 服务从不同入口启动的场景
load_dotenv(find_dotenv())

# 使用 OpenAI 兼容协议接入模型；三个变量名与 .env.example 保持一致
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")

# 缺少密钥时在这里明确报错：主智能体和子智能体都依赖 model，
# 直接抛错的提示比 init_chat_model 内部的报错更容易让新手定位到 .env 配置
if not DEEPSEEK_API_KEY:
    raise RuntimeError(
        "未检测到 DEEPSEEK_API_KEY，请先复制 .env.example 为 .env 并填入大模型密钥。"
    )

model = init_chat_model(
    model=DEEPSEEK_MODEL,
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL,
)
