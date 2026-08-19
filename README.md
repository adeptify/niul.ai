# 牛来

macOS 桌宠：一头尽量还原电影《牛来》的小牛，头顶气泡列出本机 AI Runtime / 桌面端的 Session。

三态：**工作中**（进程在、session 文件刚被写入） / **闲着**（进程在但没干活） / **不在线**。点一条会前置对应窗口，并尽量打开它的工作目录。

## 运行

```bash
npm install
npm start
```

需要 macOS。第一次点 Session 跳转时，系统可能要求给「辅助功能」权限。

## 会扫什么

内置 Cursor、Claude Code、Claude Desktop、Codex、Gemini CLI、OpenCode、Pi、Aider、Continue、Windsurf、Copilot、Crush、Goose、Amp、Cline、Zed、Warp、ChatGPT。齿轮里可开关，也可以加自定义 glob。

配置写在 `~/Library/Application Support/niul.ai/config.json`。
