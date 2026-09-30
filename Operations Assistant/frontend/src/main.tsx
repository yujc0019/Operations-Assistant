import "antd/dist/reset.css";
import { App as AntApp, ConfigProvider, theme } from "antd";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#1fc9a1",
          colorSuccess: "#34d399",
          colorWarning: "#f5b04d",
          colorError: "#f26d7e",
          colorInfo: "#1fc9a1",
          colorBgBase: "#0a0d12",
          colorBgContainer: "#11161e",
          colorBorder: "rgba(255, 255, 255, 0.1)",
          borderRadius: 10,
          fontFamily:
            "'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, 'Segoe UI', sans-serif",
          fontFamilyCode:
            "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
        },
        components: {
          Button: {
            controlHeightLG: 46,
            primaryShadow: "0 4px 18px rgba(31, 201, 161, 0.28)"
          },
          Input: {
            activeBorderColor: "#1fc9a1",
            hoverBorderColor: "#34d399"
          }
        }
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
