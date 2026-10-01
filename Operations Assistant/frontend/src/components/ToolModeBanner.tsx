import { CloseOutlined } from "@ant-design/icons";
import { Button } from "antd";
import type { ToolModeMeta } from "../lib/opsTopics";

interface ToolModeBannerProps {
  meta: ToolModeMeta;
  onExit: () => void;
}

/** 主区顶部的定向模式标签条：展示当前工具模式，点击 ✕ 退出回到普通模式 */
export function ToolModeBanner({ meta, onExit }: ToolModeBannerProps) {
  return (
    <div className="tool-mode-banner" aria-label={`当前处于${meta.toolName}模式`}>
      <span className="tool-mode-icon" aria-hidden>
        {meta.icon}
      </span>
      <span className="tool-mode-name">{meta.toolName}模式</span>
      <span className="tool-mode-desc">{meta.description}</span>
      <Button
        aria-label={`退出${meta.toolName}模式`}
        className="tool-mode-exit"
        icon={<CloseOutlined aria-hidden />}
        onClick={onExit}
        shape="circle"
        size="small"
        type="text"
      />
    </div>
  );
}
