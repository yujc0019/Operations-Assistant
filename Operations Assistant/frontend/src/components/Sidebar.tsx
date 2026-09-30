import { CaretDownOutlined, DeleteOutlined, FileTextOutlined, PlusOutlined } from "@ant-design/icons";
import { useState } from "react";
import { QUICK_TOOLS } from "../lib/opsTopics";
import type { SessionRecord } from "../lib/sessions";
import type { BackendHealth } from "../hooks/useBackendHealth";

interface SidebarProps {
  currentThreadId: string;
  health: BackendHealth;
  sessions: SessionRecord[];
  onDeleteSession: (threadId: string) => void;
  /** 点击常用工具后，把对应的示例问题预填到输入框 */
  onUseTool: (question: string) => void;
  onNewSession: () => void;
  onSwitchSession: (threadId: string) => void;
}

function SidebarGroup({
  children,
  defaultOpen,
  title
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="sidebar-group">
      <button
        aria-expanded={open}
        className="sidebar-group-header"
        onClick={() => setOpen((previous) => !previous)}
        type="button"
      >
        {title}
        <CaretDownOutlined aria-hidden className={open ? "chevron" : "chevron chevron--collapsed"} />
      </button>

      {open ? children : null}
    </section>
  );
}

export function Sidebar({
  currentThreadId,
  health,
  sessions,
  onDeleteSession,
  onUseTool,
  onNewSession,
  onSwitchSession
}: SidebarProps) {
  return (
    <aside className="chat-sidebar" aria-label="会话导航">
      <div className="sidebar-brand">
        <span className="brand-logo" aria-hidden>
          <span className="logo-glyph">&gt;_</span>
        </span>
        <div className="brand-copy">
          <h1>运维问答助手</h1>
          <p>智能解答运维问题，提升运维效率</p>
        </div>
      </div>

      <button className="new-chat-button" onClick={onNewSession} type="button">
        <PlusOutlined aria-hidden />
        新建对话
      </button>

      <nav className="sidebar-nav">
        <SidebarGroup defaultOpen title="对话历史">
          <ul className="session-list">
            {sessions.length === 0 ? (
              <li className="session-empty">暂无历史对话</li>
            ) : (
              sessions.map((item) => (
                <li
                  className={
                    item.threadId === currentThreadId
                      ? "session-item session-item--active"
                      : "session-item"
                  }
                  key={item.threadId}
                >
                  <button
                    className="session-open"
                    onClick={() => onSwitchSession(item.threadId)}
                    title={item.title}
                    type="button"
                  >
                    <FileTextOutlined aria-hidden />
                    <span className="session-title">{item.title}</span>
                  </button>
                  <button
                    aria-label={`删除会话 ${item.title}`}
                    className="session-delete"
                    onClick={() => onDeleteSession(item.threadId)}
                    type="button"
                  >
                    <DeleteOutlined aria-hidden />
                  </button>
                </li>
              ))
            )}
          </ul>
        </SidebarGroup>

        <SidebarGroup defaultOpen title="常用工具">
          <ul className="tool-list">
                {QUICK_TOOLS.map((tool) => (
                  <li key={tool.id}>
                    <button
                      className="tool-item"
                      onClick={() => onUseTool(tool.question)}
                      title={tool.question}
                      type="button"
                    >
                      {tool.icon}
                      <span>{tool.toolName}</span>
                    </button>
                  </li>
                ))}
          </ul>
        </SidebarGroup>
      </nav>

      <footer className="sidebar-status-card">
        <span className="sidebar-status-title">系统状态</span>
        <span className={health.ok ? "status-line status-line--ok" : "status-line status-line--bad"}>
          <span className="status-dot" aria-hidden />
          {health.ok ? "服务正常" : "服务异常"}
        </span>
        <time className="status-time">{health.checkedLabel || "正在检查服务状态..."}</time>
      </footer>
    </aside>
  );
}
