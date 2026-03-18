# WillClaw — PLAN.md

> **一句话定位**：OpenClaw 的精简替代品。TypeScript 从零写，不用 OpenClaw 任何代码，
> 保留其提示词工程精髓，砍掉臃肿的插件系统和 20+ 渠道抽象。
> 运行在 Mac Mini 上，24x7 常驻，个人使用为主，未来可能开源。

---

## 0. 为什么要做这个

### OpenClaw 的问题

- **太大**：10 万+ 行代码，Node.js 单体 + 插件系统 + Gateway WebSocket 控制面
- **太多 bug**：WhatsApp 频繁断连、session 锁冲突、插件安全问题（ClawHub 12% 恶意技能）
- **维护太麻烦**：一周多个 breaking release，pre-1.0 状态，升级经常炸

### OpenClaw 值得保留的

- **提示词工程范式**：文件驱动 Agent 人格、行为、记忆
- **多渠道聊天**：随时随地通过 Telegram/Discord 等与 Agent 交互
- **Heartbeat 机制**：Agent 定期主动做事
- **Browser 控制 + 屏幕操作**：真正的自主 Agent 能力

### OpenClaw 的 Workspace 文件（参考）

| 文件           | 作用                              | WillClaw 取舍                   |
| -------------- | --------------------------------- | ------------------------------- |
| `AGENTS.md`    | 行为规则、boot sequence、安全策略 | ✅ 保留                         |
| `SOUL.md`      | 人格、语气、价值观                | ❌ 合并进 IDENTITY.md           |
| `IDENTITY.md`  | 名字、emoji、avatar               | ✅ 保留（扩展，吸收 SOUL）      |
| `USER.md`      | 用户信息、偏好                    | ❌ 合并进 RULES.md 或独立       |
| `TOOLS.md`     | 环境相关工具声明                  | ❌ 改为自动生成                 |
| `HEARTBEAT.md` | 定期任务指令                      | ✅ 保留，默认1小时              |
| `BOOTSTRAP.md` | 首次引导（用完删除）              | ❌ 不需要，`willclaw init` 处理 |
| `BOOT.md`      | 启动钩子                          | ❌ 不需要，config.yaml 处理     |
| `MEMORY.md`    | 长期记忆                          | ✅ 保留                         |
| `GOALS.md`     | 目标模板                          | ❌ 不需要                       |
| `SOUVENIR.md`  | 纪念模板                          | ❌ 不需要                       |
| `memory/*.md`  | 每日笔记（按需读取）              | ✅ 保留                         |

### WillClaw 的目标

用 **< 5000 行 TypeScript** 实现 OpenClaw **80% 的核心能力**，做到：

1. 安装简单（`npm install -g willclaw`）
2. 代码可读（一个人能完全理解和维护）
3. 运行稳定（不依赖庞大的插件生态）
4. 按需扩展（需要什么加什么）

---

## 0.5 核心原则：不重复造轮子

> **只实现 Coding Agent 自己没做过的功能。**

各 CLI Agent 已经自带了很多能力。WillClaw 的价值不是重新实现它们，而是做**编排层**——把它们串起来、加上渠道接入、加上持久化。

### 各 Agent 已有能力（WillClaw 不重复实现）

| 能力              |     Claude Code     | Codex |     OpenCode     |       Gemini CLI       |
| ----------------- | :-----------------: | :---: | :--------------: | :--------------------: |
| 文件读写          |         ✅          |  ✅   |        ✅        |           ✅           |
| Shell 执行        |         ✅          |  ✅   |        ✅        |           ✅           |
| Git 操作          |         ✅          |  ✅   |        ✅        |           ✅           |
| 代码搜索          |         ✅          |  ✅   |        ✅        |           ✅           |
| Web 搜索          |      ✅ (tool)      |  ✅   |        ✅        | ✅ (google_web_search) |
| 会话内上下文      |    ✅ (/compact)    |  ✅   |        ✅        |           ✅           |
| 自身 session 管理 | ✅ (/resume, /fork) |  ✅   |  ✅ (sessions)   |   ✅ (checkpointing)   |
| MCP 支持          |         ✅          |  ✅   |        ✅        |           ✅           |
| 权限控制          |  ✅ (permissions)   |  ✅   | ✅ (tool policy) |     ✅ (yolo mode)     |

### 明确不做

- **不做通用 MCP 工具层给 CLI coding agent 用**：像 `Exec`、`Read`、`Write`、`Edit` 这种基础能力，Claude Code / Codex / OpenCode / Gemini CLI 自己已经有，不再重复实现一套给它们调用
- **不把 WillClaw 做成另一个 coding agent**：WillClaw 负责调度、持久化、渠道、记忆、心跳、宿主能力，不负责替代现有 coding agent 的核心工作流
- **不试图拦截 CLI agent 内部工具调用**：子进程里的 shell / 文件 / git 行为默认视为黑盒，不做代理层，不做嵌套 MCP

### WillClaw 真正负责的能力

- **编排层**：agent 路由、fallback、工作模式、workspace prompt 组装
- **宿主层**：聊天渠道、heartbeat / cron、history export、记忆库、统一日志
- **agent 原生没有的能力**：browser / screen / macOS desktop / 主动推送 / 长期记忆检索
- **必要时给非 CLI backend 提供最小宿主能力**：例如 `direct-api` 这类后端如果没有本地能力，可以按策略暴露少量 hosted tool；但这不是 WillClaw 的主产品面

| CLAUDE

| 决策       | 选择                                   | 理由                                      |
| ---------- | -------------------------------------- | ----------------------------------------- |
| 语言       | TypeScript                             | 最熟悉；生态丰富                          |
| 运行时     | Node.js ≥ 20                           | 原生 fetch、稳定的 subprocess             |
| 包管理     | pnpm                                   | 快、磁盘省                                |
| 项目结构   | monorepo (pnpm workspace)              | core / web-ui / cli 分包                  |
| HTTP 框架  | Hono                                   | 比 Express 轻量，类型安全，原生 WebSocket |
| 数据库     | SQLite (better-sqlite3)                | 零运维，单文件                            |
| Scheduler  | node-cron                              | 轻量，够用                                |
| Telegram   | grammy                                 | 最现代的 TS Telegram 库                   |
| Discord    | discord.js                             | 生态最大                                  |
| 飞书       | @larksuiteoapi/node-sdk                | 官方 SDK                                  |
| Browser    | Playwright                             | 比 CDP 更稳定                             |
| macOS 控制 | AppleScript + cliclick + screencapture | 原生                                      |
| Web UI     | React + Vite                           | 轻量 SPA                                  |
| ACP Client | HTTP (fetch)                           | ACP 就是 REST，不需要 SDK                 |

### 不用的技术

| 不用               | 为什么                       |
| ------------------ | ---------------------------- |
| OpenClaw 代码      | 从零写                       |
| Redis / PostgreSQL | SQLite 够用                  |
| Docker             | 直接跑 macOS，需要系统级 API |
| Electron           | 浏览器访问就够               |
| 通用 Coding MCP    | CLI agent 已有，不重复实现   |

---

## 2. 架构概览

```
┌──────────────────────────────────────────────────────────┐
│                     Chat Channels                         │
│   Telegram  │  Discord  │  Feishu  │  Web UI (SPA)       │
└──────────────────────────┬───────────────────────────────┘
                           │ 统一 IncomingMessage 格式
                           ▼
┌──────────────────────────────────────────────────────────┐
│                    Core Server (Hono)                      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Orchestrator (核心调度器)                │  │
│  │                                                      │  │
│  │  ┌──────────────┐   ┌────────────────────────────┐  │  │
│  │  │ Prompt        │   │ Agent Router                │  │  │
│  │  │ Assembler     │   │                             │  │  │
│  │  │               │   │  意图识别 → Agent 选择      │  │  │
│  │  │ Loads:        │   │  Fallback chain             │  │  │
│  │  │ IDENTITY.md   │   │  Timeout / retry            │  │  │
│  │  │ AGENTS.md     │   │                             │  │  │
│  │  │ RULES.md      │   │  ┌───────────────────────┐  │  │  │
│  │  │ MEMORY.md     │   │  │ Claude Code (CLI)     │  │  │  │
│  │  │ WORK_MODES.md │   │  │ Codex (CLI)           │  │  │  │
│  │  │ SKILLS.md     │   │  │ OpenCode (CLI)        │  │  │  │
│  │  │ HEARTBEAT.md  │   │  │ Gemini CLI (CLI)      │  │  │  │
│  │  │ etc.          │   │  │ Direct API (HTTP)     │  │  │  │
│  │  └──────────────┘   │  │ ACP Agents (HTTP)     │  │  │  │
│  │                      │  └───────────────────────┘  │  │  │
│  │                      └────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Heartbeat     │  │ Memory       │  │ Tools         │  │
│  │ Engine        │  │ Store        │  │               │  │
│  │ (1hr default) │  │ (SQLite +    │  │ Host Tools    │  │
│  │               │  │  Markdown)   │  │ Browser       │  │
│  │ + Cron        │  │              │  │ Screen        │  │
│  │ Scheduler     │  │              │  │ macOS / etc.  │  │
│  └───────────────┘  └──────────────┘  └───────────────┘  │
│                                                           │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Command       │  │ Memory       │  │ Tool          │  │
│  │ Completion    │  │ Search       │  │ Execution     │  │
│  │ Monitor       │  │ Engine       │  │ Logger        │  │
│  │               │  │ (FTS5)       │  │ (硬编码)      │  │
│  └───────────────┘  └──────────────┘  └───────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              History Exporter                         │  │
│  │   对话自动保存到 historyMessages/*.md                 │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

> 这里的 `Tools` 指 **WillClaw 宿主层能力**，不是给 Claude Code / Codex / Gemini 再造一层通用 `Exec/Read/Write` MCP。

---

## 3. Workspace 文件系统

用户自行编写所有 `.md` 文件内容。WillClaw 只负责加载、注入、热重载。

```
~/.willclaw/
├── config.yaml                  # 唯一配置文件
├── workspace/
│   ├── IDENTITY.md              # Agent 身份：名字、人格、语气、边界
│   ├── AGENTS.md                # Agent 行为规则、安全策略、boot sequence
│   ├── RULES.md                 # 用户自定义系统提示词（随时可编辑的 "system prompt"）
│   ├── MEMORY.md                # 长期记忆（Agent 自动维护）
│   ├── HEARTBEAT.md             # 心跳任务指令（默认1小时执行一次）
│   ├── PROJECT_HEARTBEAT.md     # 项目级心跳（项目进度追踪、定期检查）
│   ├── SKILLS.md                # 技能定义（当前 Agent 拥有的能力描述）
│   ├── SKILLS_INDEX.md          # 技能索引（所有可用技能的目录 + 路径）
│   ├── WORK_MODES.md            # 工作模式定义（coding / research / chat / ops 等）
│   ├── memory/                  # 每日笔记（按需读取，不自动注入）
│   │   ├── 2026-03-16.md
│   │   └── ...
│   └── skills/                  # 技能实现目录
│       ├── daily-briefing/
│       │   └── SKILL.md
│       └── git-reviewer/
│           └── SKILL.md
├── historyMessages/             # 对话历史自动保存（Markdown）
│   ├── telegram/
│   │   ├── 2026-03-16_chat-12345.md
│   │   └── ...
│   ├── discord/
│   │   └── ...
│   ├── web/
│   │   └── ...
│   └── cron/
│       └── ...
├── logs/                        # 工具执行日志（WillClaw 硬编码写入）
│   ├── tool-executions.db       # SQLite（结构化，供 WebUI 查询）
│   └── willclaw.log             # 运行日志（pino，JSON lines）
└── data/
    └── willclaw.db              # 主数据库（消息、会话等）
```

### Bootstrap 注入策略

每次 Agent 执行时，Prompt Assembler 按以下顺序加载并拼接 system prompt：

```
1. IDENTITY.md        — 你是谁（始终注入）
2. AGENTS.md          — 行为规则（始终注入）
3. RULES.md           — 用户自定义指令（始终注入）
4. WORK_MODES.md      — 当前工作模式上下文（始终注入）
5. SKILLS.md          — 当前技能描述（始终注入）
6. SKILLS_INDEX.md    — 技能目录（始终注入，供 Agent 按需加载 SKILL.md）
7. MEMORY.md          — 长期记忆（仅私聊注入，群聊不注入）
8. HEARTBEAT.md       — 心跳任务（仅心跳触发时注入）
9. PROJECT_HEARTBEAT.md — 项目心跳（仅心跳触发时注入）
10. 运行时上下文       — 时间、系统信息、当前工作模式
```

**文件限制**：

- 单文件上限：20,000 chars（`bootstrapMaxChars`）
- 总注入上限：100,000 chars（`bootstrapTotalMaxChars`）
- 超出截断，附截断标记
- 文件不存在 → 跳过（不报错，不注入占位符）
- 文件有改动 → `chokidar` 自动热重载缓存

### 与 OpenClaw 的区别

|              | OpenClaw                       | WillClaw                                      |
| ------------ | ------------------------------ | --------------------------------------------- |
| SOUL.md      | 独立文件                       | 合并进 IDENTITY.md                            |
| USER.md      | 独立文件                       | 合并进 RULES.md（用户上下文作为规则的一部分） |
| TOOLS.md     | 手动维护                       | 自动生成（基于 config.yaml 中启用的工具）     |
| BOOTSTRAP.md | 首次引导，用完删               | 不需要，`willclaw init` 搞定                  |
| BOOT.md      | 启动钩子                       | 不需要，config.yaml                           |
| HEARTBEAT.md | 被 heartbeat 触发读取          | 同，但默认1小时（OpenClaw 是30分钟）          |
| memory/\*.md | 按需读取（memory_search 工具） | 同，不自动注入                                |

---

## 4. Agent Pool

### 4.1 CLI Agents（子进程调用）

| Agent       | CLI 调用                                              | auto-permission          | 输出格式        |
| ----------- | ----------------------------------------------------- | ------------------------ | --------------- |
| Claude Code | `claude -p "<prompt>" --dangerously-skip-permissions` | ✅ skip                  | 纯文本 (stdout) |
| Codex       | `codex --full-auto "<prompt>"`                        | ✅ full-auto             | 纯文本          |
| OpenCode    | `opencode run "<prompt>" --format json`               | 需配置 permission policy | JSON            |
| Gemini CLI  | `gemini -p "<prompt>" --output-format json`           | `--yolo` 可选            | JSON            |

### 4.2 Direct API Agent

HTTP 直调 Anthropic API，用于简单问答和 cron 任务。

### 4.3 ACP Agents（Agent-to-Agent 通信）

WillClaw 同时作为 **ACP Client**（调用外部 Agent）和可选的 **ACP Server**（被外部调用）。

**ACP 是什么**：Agent Communication Protocol，IBM BeeAI 主导的开源协议（已与 Google A2A 合并到 Linux Foundation）。核心是 REST API — 不需要 SDK，普通 HTTP 请求即可。

**为什么要 ACP**：

- 让 WillClaw 能调用其他 ACP-compatible agent（比如 OpenCode 的 ACP server、JetBrains AI 中的 ACP agent）
- 让其他工具能调用 WillClaw 作为 agent
- 标准化接口，不用为每个 agent 写自定义集成

**ACP 核心概念**：

```
Agent Discovery:  GET  /agents              → 列出可用 agent
Agent Detail:     GET  /agents/{id}         → agent 元数据和能力
Run (sync):       POST /agents/{id}/run     → 同步执行，等待完成
Run (async):      POST /agents/{id}/run     → 返回 run_id，轮询状态
Run Status:       GET  /agents/{id}/runs/{run_id}
Run Cancel:       POST /agents/{id}/runs/{run_id}/cancel
```

**WillClaw 作为 ACP Client**：

```typescript
// config.yaml 中配置外部 ACP agents
acp:
  agents:
    research-bot:
      url: "http://localhost:9100"          # 本地 ACP server
      agent_id: "research-agent"
    opencode-server:
      url: "http://localhost:4096"          # opencode serve 的 ACP 端点
      agent_id: "default"
    remote-agent:
      url: "https://agent.example.com"      # 远程 ACP agent
      agent_id: "analyst"
      auth:
        type: bearer
        token_env: REMOTE_AGENT_TOKEN
```

用户在聊天中调用：

```
@research-bot 帮我调研 2026 年 AI agent 框架对比
@opencode-server 用 Gemini 2.5 Pro 重构这个函数
```

**WillClaw 作为 ACP Server**（可选）：

- 在 config.yaml 中开启 `acp.server.enabled: true`
- 暴露标准 ACP 端点，让 JetBrains、其他 agent 能调用 WillClaw
- 路径：`/acp/agents`, `/acp/agents/{id}/run` 等

### 4.4 Agent Router 选择逻辑

```
用户消息
  │
  ├─ @agent-name → 使用指定 Agent（CLI / API / ACP）
  │
  ├─ /command → 内置命令
  │
  ├─ WORK_MODES.md 中定义了当前模式的 default agent？ → 使用该 agent
  │
  ├─ 代码关键词 → coding agent（默认 Claude Code）
  │
  ├─ 需要长上下文 → Gemini CLI（1M context）
  │
  └─ 其他 → Direct API
```

**Fallback Chain**：

```
claude-code → codex → opencode → gemini → direct-api
```

---

## 5. Command Completion Monitor（命令完成自动通知）

### 问题

Claude Code / Codex 等 CLI agent 通过子进程执行，如果任务需要几分钟，用户不知道什么时候完成。
OpenClaw 没有很好地解决这个问题。

### 设计

当 CLI agent 子进程退出时，WillClaw 自动向对话注入一条**系统消息**：

```typescript
interface CommandCompletionMessage {
  type: 'system';
  subtype: 'command_completion';
  agent: string; // 哪个 agent
  exitCode: number; // 退出码
  duration: number; // 耗时（秒）
  outputPreview: string; // stdout 前 500 字符
  outputFull?: string; // 完整输出（存 SQLite，可查询）
  error?: string; // stderr（如果有）
  timestamp: string;
}
```

**注入逻辑**：

```
CLI Agent 子进程退出
  │
  ├─ exitCode === 0?
  │   ├─ YES → 注入: "✅ [claude-code] 完成 (12.3s)\n输出: {preview}"
  │   └─ NO  → 注入: "❌ [claude-code] 失败 (exit=1)\n错误: {stderr}"
  │
  └─ 同时推送到当前活跃 channel（Telegram / Web UI / Discord）
```

**关键点：后台任务通知，不是前台聊天重复回执**

前台聊天任务已经会直接返回 assistant 回复，因此：

- **前台聊天**：更新“正在执行中”状态，不额外插入 `command_completion`
- **后台任务**：写入 `command_completion`，用于离线提醒、失败通知、审计

这个 monitor 只对**通过子进程调用的 CLI agent** 生效，且只在以下条件下：

```typescript
// config.yaml
agents:
  pool:
    claude-code:
      completion_notify: background_only
    codex:
      completion_notify: background_only
    opencode:
      completion_notify: background_only
    gemini:
      completion_notify: background_only
    direct-api:
      completion_notify: false     # ← API 调用同步返回，不需要
```

### 长任务进度（Phase 2+）

初期：子进程退出时一次性通知。

后期可选增强：

- 实时 stream CLI agent 的 stdout → WebSocket → Web UI
- 定期发送"仍在执行中... (45s)" 心跳到 Telegram
- 支持 `/cancel` 命令终止正在执行的 agent

---

## 6. Web UI 消息撤回 / Undo

### 需求

打错消息时，可以撤回（类似 Cursor / Claude Code 的 undo）。
撤回后，Agent 不应该基于已撤回的消息生成回复。

### 设计

```
用户发送消息 → Agent 开始处理
  │
  ├─ 用户点击 "撤回" (在 Agent 回复前)
  │   ├─ 取消正在执行的 Agent run（按 runId / process group）
  │   ├─ 从 SQLite 中标记为 revoked（不是物理删除）
  │   ├─ Web UI 中该消息显示为已撤回（灰色/删除线）
  │   └─ 后续 prompt、搜索、memory_search 全部跳过已撤回消息
  │
  ├─ 用户点击 "撤回" (在 Agent 已回复后)
  │   ├─ 标记用户消息 + 对应的 Agent 回复都为 revoked
  │   ├─ Web UI 中折叠/隐藏这对消息
  │   └─ 后续 prompt、搜索、memory_search 全部跳过
  │
  └─ 用户点击 "编辑并重发"
      ├─ 标记原消息 revoked
      ├─ 取消 Agent run（如果在执行中）
      ├─ 打开编辑框，预填原消息内容
      └─ 编辑后作为新消息发送
```

### 一致性原则

- **SQLite messages 表是真相源**
- `historyMessages/*.md` 是人类可读导出，不作为撤回后的权威搜索来源
- 撤回后必须同时从：
  - prompt 组装
  - `/search`
  - Agent `memory_search`
  - Web UI 默认消息流
    中消失

### Web UI 实现

```
┌──────────────────────────────────────┐
│  你: 帮我写一个快速排序 pytho        │ ← hover 显示操作按钮
│                          [撤回] [编辑] │
├──────────────────────────────────────┤
│  🤖: 正在处理...                     │
│                          [取消]       │
└──────────────────────────────────────┘
```

**Telegram / Discord 的撤回**：

- Telegram：bot 收到用户编辑消息的事件 → 触发重新处理
- Discord：监听 messageUpdate 事件
- 主动撤回在 Telegram/Discord 中不直接支持（bot 无法删用户消息），但可以通过 `/undo` 命令实现逻辑撤回

### SQLite Schema 变更

```sql
ALTER TABLE messages ADD COLUMN status TEXT DEFAULT 'active';  -- active | revoked
ALTER TABLE messages ADD COLUMN revoked_at TEXT;
ALTER TABLE messages ADD COLUMN edit_of INTEGER REFERENCES messages(id);  -- 编辑自哪条消息
ALTER TABLE messages ADD COLUMN run_id TEXT;   -- 关联执行中的 agent run
```

---

## 7. Heartbeat 引擎

### 与 OpenClaw 的对比

|        | OpenClaw                | WillClaw                            |
| ------ | ----------------------- | ----------------------------------- |
| 频率   | 固定 30 分钟            | 默认 1 小时（可配置）               |
| 机制   | heartbeat prompt 注入   | 读取 HEARTBEAT.md → 执行 → 推送结果 |
| 项目级 | 无                      | PROJECT_HEARTBEAT.md 独立配置       |
| 响应   | HEARTBEAT_OK 或执行动作 | 同，但可配置静默模式                |

### 执行流程

```
每1小时触发
  │
  ├─ 读取 HEARTBEAT.md
  ├─ 读取 PROJECT_HEARTBEAT.md（如果存在）
  │
  ├─ 组装 heartbeat prompt:
  │   system = IDENTITY.md + AGENTS.md + RULES.md + HEARTBEAT.md + PROJECT_HEARTBEAT.md
  │   user = "现在是 {time}。执行心跳检查。如果没有需要做的事情，回复 HEARTBEAT_OK。"
  │
  ├─ 调用 agent（默认 direct-api，可配置）
  │
  ├─ 解析响应:
  │   ├─ "HEARTBEAT_OK" → 记录日志，不推送
  │   └─ 其他内容 → 推送到指定 channel
  │
  └─ 记录到 memory/{date}.md（可选）
```

### 配置

```yaml
heartbeat:
  enabled: true
  interval: '0 * * * *' # 每小时整点（cron 表达式）
  agent: direct-api
  notify: telegram # 有内容时推送到哪
  silent_ok: true # HEARTBEAT_OK 时不推送
  inject_files: # 心跳时额外注入的文件
    - HEARTBEAT.md
    - PROJECT_HEARTBEAT.md

# Cron 任务与 heartbeat 并存
cron:
  daily_briefing:
    schedule: '0 8 * * *'
    agent: direct-api
    prompt: '生成今日简报'
    notify: telegram

  memory_compact:
    schedule: '0 2 * * *'
    agent: direct-api
    prompt: '总结今天对话，更新 MEMORY.md'
    notify: null
```

---

## 8. 核心模块设计

### 8.1 Channel Adapters

```typescript
interface ChannelAdapter {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(chatId: string, message: string, options?: SendOptions): Promise<void>;
  onMessage(handler: MessageHandler): void;
}

interface IncomingMessage {
  channel: string;
  chatId: string;
  userId: string;
  text: string;
  replyTo?: string;
  attachments?: Attachment[];
  isGroup: boolean;
  isMentioned: boolean;
  isEdit: boolean; // 消息被编辑（触发 redo）
  editedMessageId?: string; // 被编辑的原消息 ID
}
```

| 渠道     | 库                      | 备注                                         |
| -------- | ----------------------- | -------------------------------------------- |
| Telegram | grammy                  | 支持 inline keyboard, 文件传输, 消息编辑事件 |
| Discord  | discord.js              | slash commands + messageUpdate 事件          |
| 飞书     | @larksuiteoapi/node-sdk | 事件订阅                                     |
| Web UI   | Hono WebSocket + React  | 自带，始终开启，支持撤回/编辑                |

### 8.2 Agent 接口

```typescript
interface AgentBackend {
  readonly name: string;
  readonly type: 'cli' | 'api' | 'acp';

  execute(request: AgentRequest): Promise<AgentResponse>;
  cancel(runId: string): Promise<void>; // 取消指定任务
  isAvailable(): Promise<boolean>;
}

interface AgentRequest {
  runId: string;
  text: string;
  systemPrompt: string;
  history: Message[];
  attachments?: Attachment[];
  workingDirectory?: string;
  executionMode?: 'foreground' | 'background';
}

interface AgentResponse {
  content: string;
  exitCode?: number; // CLI agent 退出码
  duration: number; // 执行耗时(ms)
  agent: string; // 实际执行的 agent 名
  metadata?: Record<string, unknown>;
}
```

**取消模型**：

- CLI agent 以独立 **process group** 启动
- Orchestrator 维护 `runId -> { pid, pgid, agent, chatId }`
- `/cancel`、撤回、超时 都按 `runId` kill 整个 process group，而不是只杀父进程

### 8.3 ACP Client

```typescript
interface ACPClient {
  // 发现
  listAgents(serverUrl: string): Promise<ACPAgentInfo[]>;
  getAgent(serverUrl: string, agentId: string): Promise<ACPAgentInfo>;

  // 同步执行
  runSync(
    serverUrl: string,
    agentId: string,
    messages: ACPMessage[],
  ): Promise<ACPRunResult>;

  // 异步执行
  runAsync(
    serverUrl: string,
    agentId: string,
    messages: ACPMessage[],
  ): Promise<string>; // returns run_id
  getRunStatus(
    serverUrl: string,
    agentId: string,
    runId: string,
  ): Promise<ACPRunStatus>;
  cancelRun(serverUrl: string, agentId: string, runId: string): Promise<void>;
}

// ACP Agent 在 Agent Pool 中和 CLI/API agent 统一调度
// 用户通过 @agent-name 调用，Orchestrator 根据 config 判断走 CLI/API/ACP
```

### 8.4 Memory Store + Search

```sql
-- ═══ 主数据库: data/willclaw.db ═══

CREATE TABLE messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT NOT NULL,
  channel     TEXT NOT NULL,
  chat_id     TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL,       -- 'user' | 'assistant' | 'system'
  content     TEXT NOT NULL,
  agent       TEXT,                -- 哪个 agent 回复的
  duration_ms INTEGER,             -- agent 执行耗时
  exit_code   INTEGER,             -- CLI agent 退出码
  metadata    TEXT,                -- JSON
  status      TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'revoked'
  revoked_at  TEXT,
  edit_of     INTEGER REFERENCES messages(id),
  run_id      TEXT
);

-- FTS5 全文搜索
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content, channel, role,
  content='messages', content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, channel, role)
  SELECT new.id, new.content, new.channel, new.role
  WHERE new.status = 'active';
END;

CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, channel, role)
  VALUES ('delete', old.id, old.content, old.channel, old.role);

  INSERT INTO messages_fts(rowid, content, channel, role)
  SELECT new.id, new.content, new.channel, new.role
  WHERE new.status = 'active';
END;

CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, channel, role)
  VALUES ('delete', old.id, old.content, old.channel, old.role);
END;

-- 文件搜索索引（daily notes + MEMORY.md）
CREATE VIRTUAL TABLE files_fts USING fts5(
  content, filepath, file_type,
  tokenize='unicode61'
);

CREATE TABLE command_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL UNIQUE,
  timestamp   TEXT NOT NULL,
  agent       TEXT NOT NULL,
  chat_id     TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  status      TEXT NOT NULL,       -- running | completed | failed | cancelled
  pid         INTEGER,
  pgid        INTEGER,
  exit_code   INTEGER,
  duration_ms INTEGER,
  stdout      TEXT,
  stderr      TEXT
);

-- ═══ 工具日志数据库: logs/tool-executions.db ═══
-- (见 8.10 Tool Execution Logger)
```

### 8.5 macOS 深度集成

| 能力     | 实现                                |
| -------- | ----------------------------------- |
| 截屏     | `screencapture -x /tmp/ss.png`      |
| OCR      | screencapture → Direct API (vision) |
| 鼠标     | `cliclick c:x,y`                    |
| 键盘     | `cliclick t:"text"` / AppleScript   |
| 快捷键   | AppleScript `key code`              |
| 窗口信息 | AppleScript frontmost process       |
| 打开应用 | `open -a "AppName"`                 |
| 剪贴板   | `pbcopy` / `pbpaste`                |
| 通知     | `osascript display notification`    |

### 8.6 Browser 控制 (Playwright)

```typescript
interface BrowserController {
  launch(): Promise<void>;
  navigate(url: string): Promise<void>;
  screenshot(): Promise<Buffer>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  evaluate(script: string): Promise<unknown>;
  extractText(selector?: string): Promise<string>;
  close(): Promise<void>;
}
```

### 8.7 LaunchAgent / Daemon（macOS 常驻）

WillClaw 需要 24x7 运行在 Mac Mini 上。用 macOS 原生 `launchd` 而不是 pm2 / forever 等 Node 工具。

**`willclaw install-daemon`** 自动生成并加载 plist：

```xml
<!-- ~/Library/LaunchAgents/com.willclaw.agent.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.willclaw.agent</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/usr/local/lib/node_modules/willclaw/packages/cli/dist/index.js</string>
    <string>start</string>
  </array>

  <key>RunAtLoad</key>            <!-- 开机自启 -->
  <true/>

  <key>KeepAlive</key>            <!-- 崩溃自动重启 -->
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>ThrottleInterval</key>     <!-- 重启间隔，防止疯狂重启 -->
  <integer>10</integer>

  <key>WorkingDirectory</key>
  <string>/Users/william/.willclaw</string>

  <key>StandardOutPath</key>
  <string>/Users/william/.willclaw/logs/willclaw-stdout.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/william/.willclaw/logs/willclaw-stderr.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>/Users/william</string>
  </dict>
</dict>
</plist>
```

**CLI 命令**：

```bash
willclaw install-daemon    # 生成 plist + launchctl bootstrap
willclaw uninstall-daemon  # launchctl bootout + 删除 plist
willclaw restart-daemon    # bootout + bootstrap
willclaw daemon-status     # launchctl list | grep willclaw
willclaw logs              # tail -f ~/.willclaw/logs/willclaw.log
willclaw logs --tool       # tail -f tool execution log
```

**关键细节**：

- **LaunchAgent（非 LaunchDaemon）**：因为需要用户级权限（屏幕截图、AppleScript、cliclick 都需要用户会话）
- **环境变量继承**：plist 中显式设置 PATH（包含 homebrew），确保 claude / codex / gemini 等 CLI 可找到
- **路径全部写绝对路径**：不要依赖 `~` 在 launchd 中自动展开
- **API Key 传递**：从 `~/.willclaw/config.yaml` 中读取 `*_env` 引用，启动时 `dotenv` 加载 `~/.willclaw/.env`（或系统 env）
- **日志轮转**：stdout/stderr 由 launchd 管理，`willclaw.log` 由 pino 写入并按天轮转
- **健康检查**：heartbeat 执行时检测自身状态，如果发现异常可通过 Telegram 发告警

### 8.8 History Message 自动保存

所有对话自动保存为可读的 Markdown 文件，方便 grep、备份、git 版本控制。

**目录结构**：

```
~/.willclaw/historyMessages/
├── telegram/
│   ├── 2026-03-16_private-12345.md      # 按 channel + date + chatId
│   ├── 2026-03-16_group-67890.md
│   └── 2026-03-17_private-12345.md
├── discord/
│   ├── 2026-03-16_server-general.md
│   └── ...
├── web/
│   ├── 2026-03-16_default.md
│   └── ...
└── cron/
    ├── 2026-03-16_daily-briefing.md
    └── 2026-03-16_memory-compact.md
```

**文件格式**：

```markdown
# 2026-03-16 | telegram | private-12345

---

## 09:15 — User

帮我写一个快速排序

## 09:15 — WillClaw [claude-code] (12.3s, exit=0)

这是一个 Python 快速排序实现：
...

---

## 10:30 — User

@gemini 总结这篇论文

## 10:31 — WillClaw [gemini] (45.2s, exit=0)

这篇论文的主要贡献是...

---

## 11:00 — System (command_completion)

✅ [claude-code] 完成 (12.3s) — 重构 router.ts

---

## 14:00 — System (heartbeat)

HEARTBEAT_OK
```

**实现逻辑**：

```typescript
class HistoryExporter {
  // 每条消息写入时同步 append 到对应的 md 文件
  async append(message: IncomingMessage | OutgoingMessage): Promise<void>;

  // 文件名 = {date}_{chatId}.md
  // 路径 = historyMessages/{channel}/{filename}
  private getFilePath(channel: string, chatId: string, date: string): string;

  // 在消息写入 SQLite 的同时调用（不是异步 batch，是实时写入）
  // 这样即使 SQLite 坏了，md 文件还在
}
```

**撤回在导出层的语义**：

- 导出文件默认 append-only，不回头物理删改旧内容
- 撤回/编辑时追加一条 tombstone system note，标明哪条消息已 revoked / superseded
- 搜索、prompt、memory_search 一律以 SQLite 真相源为准，不从导出文件回流已撤回内容

**关键设计**：

- **实时写入**：每条消息同步 append，不做 batch（保证不丢）
- **一天一个文件**：按 `{date}_{chatId}` 切分，日期变化时新建文件
- **包含元数据**：每条消息的 header 包含时间、角色、使用的 agent、耗时、退出码
- **System 消息也记录**：heartbeat、command completion、cron 结果
- **可 git 版本控制**：整个 `historyMessages/` 可以 `git init` + 定期 commit
- **与 SQLite 互补**：SQLite 是查询引擎，md 是人类可读备份 + grep 友好

### 8.9 Memory Search（记忆搜索引擎）

像 OpenClaw 的 `memory_search` 和 `memory_get` 一样，让 Agent 和用户都能搜索历史。

**真相源约定**：

- 对话消息搜索以 SQLite `messages` / `messages_fts` 为准
- `historyMessages/*.md` 只是导出备份，不作为撤回后的权威索引来源

**搜索范围**：

| 数据源   | 存储位置                       | 搜索方式             |
| -------- | ------------------------------ | -------------------- |
| 对话消息 | `data/willclaw.db` messages 表 | SQLite FTS5 全文搜索 |
| 每日笔记 | `workspace/memory/*.md`        | 文件内容索引到 FTS5  |
| 长期记忆 | `workspace/MEMORY.md`          | 直接 FTS5            |

**SQLite FTS5 全文索引**：

```sql
-- 全文搜索虚拟表
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,                         -- 消息内容
  channel,                         -- 渠道
  role,                            -- user / assistant / system
  content='messages',              -- 关联实体表
  content_rowid='id',
  tokenize='unicode61'             -- 支持中文分词
);

-- 每日笔记 + MEMORY 索引
CREATE VIRTUAL TABLE files_fts USING fts5(
  content,                         -- 文件内容
  filepath,                        -- 文件路径
  file_type,                       -- 'daily_note' | 'memory'
  tokenize='unicode61'
);

-- 触发器：消息写入时自动更新 FTS 索引
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, channel, role)
  SELECT new.id, new.content, new.channel, new.role
  WHERE new.status = 'active';
END;
```

**搜索接口**：

```typescript
interface MemorySearchEngine {
  // 搜索消息
  searchMessages(
    query: string,
    options?: {
      channel?: string;
      dateFrom?: string;
      dateTo?: string;
      role?: 'user' | 'assistant';
      limit?: number;
    },
  ): Promise<SearchResult[]>;

  // 搜索文件（daily notes + MEMORY.md）
  searchFiles(
    query: string,
    options?: {
      fileType?: 'daily_note' | 'memory';
      limit?: number;
    },
  ): Promise<FileSearchResult[]>;

  // 统一搜索（消息 + 文件，按相关度排序）
  search(query: string, limit?: number): Promise<UnifiedSearchResult[]>;

  // 重建索引（文件有变化时）
  reindex(): Promise<void>;
}

interface SearchResult {
  id: number;
  content: string; // 匹配的消息内容
  snippet: string; // FTS5 高亮片段
  channel: string;
  chatId: string;
  role: string;
  timestamp: string;
  rank: number; // FTS5 相关度分数
}

interface FileSearchResult {
  filepath: string;
  content: string;
  snippet: string;
  fileType: string;
  rank: number;
}
```

**用户使用方式**：

```
/search 快速排序                      ← 搜索所有来源
/search --channel telegram 快速排序   ← 只搜 Telegram 历史
/search --date 2026-03-15 会议        ← 搜索特定日期
/search --files 项目进度              ← 只搜文件（daily notes + MEMORY.md）
```

**Agent 使用方式**：

Agent 在执行任务时可以通过 WillClaw 的窄桥接能力搜索记忆（如果 tool policy 允许）：

```
System: Agent 可以使用 memory_search 搜索历史对话和笔记。
```

Orchestrator 将 `memory_search` 暴露为 Agent 可调用的壳层能力：
- system prompt 明确告知如何请求 `memory_search`
- Agent 通过一条严格格式的桥接指令请求搜索
- WillClaw 执行搜索后把结果回注入历史，再让 Agent 继续回答

查询时默认附带 `WHERE status = 'active'`，保证撤回消息不会再回流进上下文。

**索引更新策略**：

- **消息**：通过 SQLite 触发器实时更新
- **Daily notes**：`chokidar` 监控 `workspace/memory/` 目录，变化时增量重建
- **History MD**：不作为主索引来源；保留给 grep / 备份 / git 历史
- **MEMORY.md**：`chokidar` 监控，变化时重建
- **全量重建**：`willclaw reindex` 命令 或 `/reindex` 聊天命令

### 8.10 Tool Execution Logger（工具执行日志）

**WillClaw 硬编码**在每次工具调用（shell、文件操作、浏览器、截屏等）时写入结构化日志。
不依赖 Agent 是否记录，不依赖任何配置——**始终记录**。

**为什么硬编码**：

- Agent 可能忘记记录
- CLI agent（Claude Code / Codex 等）内部的工具调用对 WillClaw 不可见——但 WillClaw 自己的工具层（shell、filesystem、screen、browser）必须有审计日志
- 出了问题需要回溯：谁调用了什么、什么时候、结果是什么

**日志存储**：双写——SQLite（供 WebUI 查询）+ 文本日志（供 grep/tail）

```sql
-- logs/tool-executions.db
CREATE TABLE tool_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT NOT NULL,
  tool        TEXT NOT NULL,       -- 'shell' | 'filesystem' | 'browser' | 'screen'
  action      TEXT NOT NULL,       -- 'exec' | 'read' | 'write' | 'trash' | 'archive' | 'screenshot' | 'click' | 'navigate'
  agent       TEXT NOT NULL,       -- 哪个 agent 触发的
  chat_id     TEXT,                -- 关联的对话
  input       TEXT NOT NULL,       -- 输入（命令/路径/URL等）
  output      TEXT,                -- 输出（截断到前 2000 chars）
  exit_code   INTEGER,             -- shell 退出码
  duration_ms INTEGER NOT NULL,    -- 执行耗时
  success     BOOLEAN NOT NULL,
  error       TEXT                 -- 错误信息
);

CREATE INDEX idx_tool_logs_time ON tool_logs(timestamp);
CREATE INDEX idx_tool_logs_tool ON tool_logs(tool, action);
CREATE INDEX idx_tool_logs_agent ON tool_logs(agent);
```

**日志写入时机**（硬编码在每个工具模块中）：

```typescript
// tools/shell.ts
export async function exec(command: string, options: ExecOptions): Promise<ExecResult> {
  const startTime = Date.now()
  try {
    const result = await child_process.exec(command, ...)
    // ← 硬编码日志
    await toolLogger.log({
      tool: 'shell',
      action: 'exec',
      agent: options.triggeredBy,
      chatId: options.chatId,
      input: command,
      output: result.stdout.slice(0, 2000),
      exitCode: result.exitCode,
      durationMs: Date.now() - startTime,
      success: result.exitCode === 0,
    })
    return result
  } catch (error) {
    await toolLogger.log({
      tool: 'shell',
      action: 'exec',
      agent: options.triggeredBy,
      chatId: options.chatId,
      input: command,
      durationMs: Date.now() - startTime,
      success: false,
      error: error.message,
    })
    throw error
  }
}
```

**每个工具模块都有相同的模式**：

| 工具         | 记录的 action                                                         |
| ------------ | --------------------------------------------------------------------- |
| `shell`      | `exec` — 命令、退出码、stdout/stderr                                  |
| `filesystem` | `read`, `write`, `trash`, `archive`, `mkdir`, `copy` — 路径、大小     |
| `screen`     | `screenshot`, `click`, `type`, `hotkey` — 坐标、文本                  |
| `browser`    | `navigate`, `click`, `type`, `screenshot`, `evaluate` — URL、selector |

**边界说明**：

- `shell` / `filesystem` 包装层主要是 **WillClaw 自己的宿主 runtime** 在用，用来做审计、history 导出、setup、运维任务
- 对 `claude-code` / `codex` / `opencode` / `gemini` 这类本身已经有文件和终端能力的 agent，WillClaw 默认不再把这套基础能力作为新的 agent-facing 工具面暴露
- 真正适合做成 hosted tool 的，是它们原生普遍没有的能力：`browser`、`screen`、`desktop`、`memory_search`、主动通知等

**文本日志**（同时写入，供 tail -f）：

```
// ~/.willclaw/logs/willclaw.log (JSON lines, pino)
{"level":30,"time":1710590400000,"tool":"shell","action":"exec","agent":"claude-code","input":"git status","exitCode":0,"durationMs":234,"success":true}
{"level":30,"time":1710590412000,"tool":"filesystem","action":"write","agent":"claude-code","input":"/Users/x/projects/app/src/router.ts","durationMs":12,"success":true}
{"level":40,"time":1710590500000,"tool":"shell","action":"exec","agent":"codex","input":"npm test","exitCode":1,"durationMs":15000,"success":false,"error":"3 tests failed"}
```

**Web UI 日志面板**：

```
┌──────────────────────────────────────────────────────────┐
│  📋 Tool Execution Log                    [Filter ▼] [🔄] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  14:23:05  🟢 shell.exec [claude-code]                   │
│            $ git status                                  │
│            exit=0  234ms                                 │
│                                                          │
│  14:23:17  🟢 filesystem.write [claude-code]             │
│            /Users/x/projects/app/src/router.ts           │
│            12ms                                          │
│                                                          │
│  14:25:00  🔴 shell.exec [codex]                         │
│            $ npm test                                    │
│            exit=1  15.0s  "3 tests failed"               │
│                                                          │
│  14:30:00  🟢 screen.screenshot [direct-api]             │
│            /tmp/willclaw-ss-1710590400.png               │
│            89ms                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**WebUI REST API**：

```
GET /api/logs/tools?limit=100&tool=shell&agent=claude-code&from=2026-03-16T00:00:00
GET /api/logs/tools/:id         # 单条日志详情（含完整 output）
GET /api/logs/tools/stats       # 统计：各工具调用次数、成功率、平均耗时
```

---

## 9. 项目结构

```
willclaw/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
│
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── index.ts               # 主入口
│   │   │   ├── config.ts              # 配置 (zod schema + 加载)
│   │   │   ├── server.ts              # Hono HTTP + WebSocket
│   │   │   ├── orchestrator.ts        # Agent 调度
│   │   │   ├── prompt.ts              # Prompt Assembler
│   │   │   ├── memory.ts              # SQLite 记忆
│   │   │   ├── memory-search.ts       # FTS5 搜索引擎
│   │   │   ├── history-exporter.ts    # 对话 → Markdown 自动保存
│   │   │   ├── tool-logger.ts         # 工具执行日志（硬编码）
│   │   │   ├── heartbeat.ts           # 心跳引擎
│   │   │   ├── scheduler.ts           # Cron 调度
│   │   │   ├── completion-monitor.ts  # 命令完成通知
│   │   │   ├── daemon.ts              # launchd plist 生成 + 管理
│   │   │   │
│   │   │   ├── agents/
│   │   │   │   ├── types.ts
│   │   │   │   ├── cli-agent.ts       # 通用 CLI 子进程封装
│   │   │   │   ├── direct-api.ts      # Anthropic API
│   │   │   │   └── acp-agent.ts       # ACP Client
│   │   │   │
│   │   │   ├── channels/
│   │   │   │   ├── types.ts
│   │   │   │   ├── telegram.ts
│   │   │   │   ├── discord.ts
│   │   │   │   ├── feishu.ts
│   │   │   │   └── web.ts
│   │   │   │
│   │   │   ├── tools/
│   │   │   │   ├── filesystem.ts
│   │   │   │   ├── shell.ts
│   │   │   │   ├── screen.ts
│   │   │   │   └── browser.ts
│   │   │   │
│   │   │   └── acp/                   # ACP Server (可选)
│   │   │       ├── server.ts          # ACP REST 端点
│   │   │       └── types.ts           # ACP OpenAPI 类型
│   │   │
│   │   └── package.json
│   │
│   ├── cli/
│   │   ├── src/
│   │   │   └── index.ts               # willclaw init/start/status/install-daemon/logs
│   │   └── package.json
│   │
│   └── web/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── ChatView.tsx
│       │   │   ├── MessageBubble.tsx   # 含撤回/编辑按钮
│       │   │   ├── UndoBar.tsx         # 撤回确认条
│       │   │   ├── AgentStatus.tsx     # Agent 执行状态
│       │   │   ├── ToolLogPanel.tsx    # 工具执行日志面板
│       │   │   ├── SearchPanel.tsx     # 记忆搜索面板
│       │   │   └── Sidebar.tsx
│       │   └── hooks/
│       │       ├── useWebSocket.ts
│       │       ├── useUndo.ts          # 撤回逻辑
│       │       └── useToolLogs.ts      # 日志轮询/WS 订阅
│       ├── index.html
│       └── package.json
│
└── docs/
    └── PLAN.md
```

---

## 10. 配置文件

```yaml
# ~/.willclaw/config.yaml

server:
  host: '127.0.0.1'
  port: 8420
  auth_token: '${WILLCLAW_AUTH_TOKEN}'

# ── Workspace Bootstrap ─────────────
workspace:
  bootstrapMaxChars: 20000 # 单文件上限
  bootstrapTotalMaxChars: 100000 # 总注入上限
  # 注入顺序和条件由 Prompt Assembler 硬编码（见第3节）
  # 文件内容由用户自行编写

# ── Agents ───────────────────────────
agents:
  default: claude-code
  routing:
    simple_qa: direct-api
    coding: claude-code
    long_context: gemini
    system: claude-code

  safety:
    prompt_transport: stdin # 不把完整 prompt 直接拼进 argv
    mutating_fallback: false # 写操作失败后不自动切下一个 agent

  pool:
    claude-code:
      enabled: true
      type: cli
      command: 'claude'
      args: ['-p', '--dangerously-skip-permissions']
      timeout: 300
      completion_notify: background_only

    codex:
      enabled: true
      type: cli
      command: 'codex'
      args: ['--full-auto']
      timeout: 300
      completion_notify: background_only

    opencode:
      enabled: true
      type: cli
      command: 'opencode'
      args: ['run', '--format', 'json']
      timeout: 300
      completion_notify: background_only

    gemini:
      enabled: true
      type: cli
      command: 'gemini'
      args: ['-p', '--output-format', 'json']
      timeout: 300
      completion_notify: background_only

    direct-api:
      enabled: true
      type: api
      provider: anthropic
      model: claude-sonnet-4-20250514
      api_key_env: ANTHROPIC_API_KEY
      max_tokens: 8192
      completion_notify: false # 同步调用，不需要

# ── ACP ──────────────────────────────
acp:
  # WillClaw 作为 ACP Client
  agents:
    # research-bot:
    #   url: "http://localhost:9100"
    #   agent_id: "research-agent"
    # opencode-server:
    #   url: "http://localhost:4096"
    #   agent_id: "default"

  # WillClaw 作为 ACP Server (可选)
  server:
    enabled: false
    port: 8421

# ── Channels ─────────────────────────
channels:
  telegram:
    enabled: true
    token_env: TELEGRAM_BOT_TOKEN
    owner_id: 0
    allowed_users: []

  discord:
    enabled: false
    token_env: DISCORD_BOT_TOKEN

  feishu:
    enabled: false
    app_id_env: FEISHU_APP_ID
    app_secret_env: FEISHU_APP_SECRET

  web:
    enabled: true

# ── Heartbeat ────────────────────────
heartbeat:
  enabled: true
  interval: '0 * * * *' # 每小时整点
  agent: direct-api
  notify: telegram
  silent_ok: true
  inject_files:
    - HEARTBEAT.md
    - PROJECT_HEARTBEAT.md

# ── Cron ─────────────────────────────
cron:
  daily_briefing:
    schedule: '0 8 * * *'
    agent: direct-api
    prompt: '生成今日简报'
    notify: telegram

  memory_compact:
    schedule: '0 2 * * *'
    agent: direct-api
    prompt: '总结今天对话，更新 MEMORY.md'
    notify: null

# ── Tools ────────────────────────────
tools:
  shell:
    confirm_destructive: true
    blocked_commands: ['rm', 'rmdir']
  filesystem:
    delete_mode: 'trash' # 不提供物理删除
    archive_dir: '~/.willclaw/archive'
  browser:
    headless: true
  screen:
    enabled: true

# ── Memory ───────────────────────────
memory:
  context_window_days: 3
  max_history_messages: 20
  search_reindex_on_start: true # 启动时重建文件搜索索引
  exclude_revoked: true # 默认不返回已撤回消息

# ── History Export ───────────────────
history:
  enabled: true
  dir: '~/.willclaw/historyMessages'
  include_system: true # 记录 system 消息（heartbeat/completion）
  git_auto_commit: false # 定期 git commit（需手动 git init）
  index_exports: false # 导出文件不参与权威搜索索引

# ── Tool Logging ─────────────────────
logging:
  tool_log_db: '~/.willclaw/logs/tool-executions.db'
  app_log: '~/.willclaw/logs/willclaw.log'
  max_output_chars: 2000 # stdout/output 截断长度
  retain_days: 90 # 日志保留天数

# ── Daemon ───────────────────────────
daemon:
  plist_label: 'com.willclaw.agent'
  # node_path: "/opt/homebrew/bin/node"  # 自动检测，可手动指定
  env_file: '~/.willclaw/.env'
```

---

## 11. 内置命令

| 命令                               | 功能                                                     |
| ---------------------------------- | -------------------------------------------------------- |
| `/status`                          | Agent 可用性、Channel 状态、Heartbeat、Cron、daemon 状态 |
| `/agent <n>`                       | 切换默认 Agent                                           |
| `/agent`                           | 列出所有可用 Agent（CLI + API + ACP）                    |
| `/mode <n>`                        | 切换工作模式（读取 WORK_MODES.md）                       |
| `/memory`                          | 记忆统计                                                 |
| `/search <keyword>`                | 统一搜索（消息 + daily notes + MEMORY.md）               |
| `/search --channel <ch> <keyword>` | 搜索特定渠道                                             |
| `/search --files <keyword>`        | 只搜文件                                                 |
| `/search --date <date> <keyword>`  | 搜索特定日期                                             |
| `/reindex`                         | 重建 FTS5 搜索索引                                       |
| `/reload`                          | 重新加载 workspace .md 文件                              |
| `/undo`                            | 撤回上一条消息（所有渠道通用）                           |
| `/cron`                            | 列出定时任务 + 下次执行时间                              |
| `/cron run <n>`                    | 手动触发 cron 任务                                       |
| `/heartbeat`                       | 立即触发一次心跳                                         |
| `/screenshot`                      | 截取当前屏幕                                             |
| `/cancel`                          | 按 runId 取消正在执行的 Agent 任务                       |
| `/acp`                             | 列出已配置的 ACP agents                                  |
| `/logs`                            | 最近 20 条工具执行日志                                   |
| `/logs <tool>`                     | 过滤特定工具的日志（shell/filesystem/screen/browser）    |
| `/help`                            | 显示帮助                                                 |

`@agent-name` 前缀指定 Agent：

```
@claude-code 重构 ~/projects/myapp 的路由层
@gemini 这篇论文 50 页，帮我总结
@research-bot 调研 2026 年 AI agent 框架    ← ACP agent
@codex 用 Python 写个 web scraper
```

---

## 12. 开发路线图

### Progress Snapshot（2026-03-17）

已落地：

- `Phase 0` 已完成：monorepo、TS/ESLint/Prettier、config schema、CLI 骨架、日志、workspace 初始化
- `Phase 1` 已完成：Prompt Assembler、Agent 接口与多 backend、Orchestrator、SQLite memory、FTS5 搜索、History Exporter、Command Completion Monitor、Tool Execution Logger、Hono REST API
- 已有运行生命周期后端：`run status / cancel / revoke / edit / resend`
- 已有 heartbeat / cron 执行引擎 + `node-cron` 调度 + 手动触发 API
- 已有 workspace memory 索引：消息搜索 + `MEMORY.md / memory/*.md` 文件搜索
- 已有手动 memory maintenance API：daily note ensure/generate、`MEMORY.md` compact
- 已有自动 memory maintenance：scheduler 可定时跑 daily note / `MEMORY.md` compact
- 已有用户侧 `/search` 命令 + agent 侧 `memory_search` 桥接
- 已有后台任务 channel fanout：heartbeat / cron 结果可推送到指定 channel
- 多 agent 已接入：`claude-code`、`codex`、`opencode`、`gemini`、`direct-api`、`acp`
- Host tools 已接入分类：`native | hosted | disabled`
- Host browser / screen 已改为 provider 优先级：
  - browser: `agent-browser -> system-open`
  - screen: `peekaboo -> screencapture`
- workspace 现在会自动生成 `SKILLS.md`、`SKILLS_INDEX.md` 和 `skills/*`
- CLI 新增 `sync-skills`，可将生成的 skills 刷到任意 workspace 目录
- 已有聊天渠道骨架：`ChannelManager + Telegram polling adapter`
- 已有 Telegram 壳层命令：`/status`、`/undo`、`/resend`、`/cancel`、`/heartbeat`、`/cron`
- 已有 Discord adapter：DM 直通、guild mention gating、基础壳层命令复用
- 已有 Feishu adapter：支持 webhook challenge、`im.message.receive_v1` 文本事件、mention gating、消息回复
- 已有 Web UI 首版：React dashboard + Hono 静态托管
- 已有 Web UI realtime：SSE 事件流 + active runs / recent events
- 已有 Web UI Markdown 渲染：assistant / system 消息支持代码块、列表、表格、引用
- 已有 Web UI chat-first 重构：三栏布局（会话列表 / 主线程 / inspector）+ `/api/chats`
- 已有 Web UI 过程感：`/api/route-preview` + route / agent attempt / fallback 活动流
- 已有 SSE 流式预览：CLI backend stdout 和 `direct-api` 的 Anthropic SSE 都会推送 `chat.run.stream.delta`，Web UI 可在最终消息落库前显示临时 assistant 气泡
- 已有 CLI 输出归一化：`opencode` / `gemini` 这类 JSON / linewise event stream 会提纯正文，不再把 `step_start`、`timestamp` 等元数据混进消息内容
- 已有 provider doctor：CLI `willclaw doctor` 和 `/api/providers/health` 会检查 `agent-browser / peekaboo / system-open / screencapture` 的安装与权限状态
- 已有 action-level provider doctor：会明确区分 `open / snapshot / capture / see / click / type / press` 哪些动作当前 healthy，hosted bridge 只向 agent 暴露健康动作
- 已有结构化宿主 browser actions：`open / snapshot / click / type / screenshot`
- 已有结构化宿主 screen actions：`capture / see / click / type / press`
- 已有 host tool action API：`/api/tools/browser/*`、`/api/tools/screen/*`
- 已有 agent-facing hosted browser/screen bridge：agent 可通过窄格式 `WILLCLAW_HOSTED_ACTION {...}` 请求 WillClaw 执行宿主动作，再继续完成任务
- `direct-api` 默认策略现已允许 `browser/screen` hosted bridge
- 已有 Web UI Host Lab：可直接触发 browser open/snapshot/screenshot 与 screen inspect/capture
- 已有 macOS 登录自启：`launch-agent install / uninstall / status / print`

尚未完成：

- 更完整 macOS GUI 自动化、OCR
- 将 provider 安装与健康检查做成正式 setup 流程

### Phase 0 — 脚手架（1-2 天）

- [x] pnpm monorepo 初始化
- [x] TypeScript + ESLint + Prettier
- [x] config.yaml zod schema + 加载 + 验证
- [x] CLI 骨架（`willclaw init` / `willclaw start` / `willclaw status`）
- [x] workspace 目录初始化（目录结构 + 生成 workspace skills）
- [x] 日志系统（pino → `~/.willclaw/logs/willclaw.log`）

### Phase 1 — 核心循环（3-5 天）

- [x] Prompt Assembler：加载所有 workspace .md → 拼装 system prompt
- [x] Agent 接口 + CLI Agent 封装（通用子进程管理）
- [x] Claude Code agent 实现
- [x] Direct API agent 实现
- [x] Orchestrator：消息路由 + agent 选择 + 只读 fallback
- [x] Memory Store：SQLite + CRUD + FTS5 全文索引
- [x] **Tool Execution Logger**：硬编码在每个工具模块中
- [x] **Command Completion Monitor**：后台子进程退出 → 系统消息注入
- [x] **History Exporter**：消息实时 append 到 historyMessages/\*.md（撤回追加 tombstone）
- [x] Hono 服务器 + REST API（含 `/api/logs/tools`）
- [x] Run lifecycle API：`/api/runs/:id`、`cancel`、`/api/messages/:id/revoke|edit|resend`

**交付**：REST API 可用，工具日志可查，后台任务自动通知，对话自动保存 md。

### Phase 2 — 聊天渠道 + Web UI（3-5 天）

- [x] Channel 接口
- [x] Telegram 适配器
- [x] Discord 适配器
- [ ] Web UI WebSocket handler
- [x] Web UI 前端（React）
- [x] Web UI SSE handler / realtime event stream
- [x] **消息撤回 / 编辑 / 重发 UI / 渠道交互层**（Web 已接；Telegram / Discord 侧还没接完）
- [x] **Tool Log Panel**（Web UI 工具日志面板）
- [x] **Search Panel**（Web UI 搜索面板）
- [x] Agent 执行状态实时显示（SSE + active runs）
- [x] Markdown 渲染
- [x] Chat-first layout（会话列表 / 主线程 / inspector）
- [x] Route preview + process activity（route / agent attempt / fallback）
- [x] CLI-backed streaming preview（SSE delta events + 临时 assistant 气泡）
- [x] Telegram shell commands（`/status`、`/undo`、`/resend`、`/cancel`、`/heartbeat`、`/cron`）

**交付**：Telegram + Web UI 聊天可用，支持撤回、日志查看、记忆搜索。

### Phase 3 — Heartbeat + Cron + Memory（2-3 天）

- [x] Heartbeat 引擎（默认1小时）
- [x] HEARTBEAT.md + PROJECT_HEARTBEAT.md 加载
- [x] node-cron 调度器
- [x] 手动触发 API：`/api/heartbeat/run`、`/api/cron`、`/api/cron/:name/run`
- [x] workspace 文件索引：`MEMORY.md` + `memory/*.md`
- [x] **Memory Search**：FTS5 搜索消息 + 文件 + daily notes（HTTP API）
- [x] 手动 memory maintenance API：daily note ensure/generate、`MEMORY.md` compact
- [x] 每日笔记自动生成（scheduler）
- [x] MEMORY.md 自动更新（scheduler）
- [x] `/search` 命令 + Agent memory_search 桥接
- [x] 推送到指定 Channel（heartbeat / cron）

**交付**：Agent 主动执行、维护记忆、可搜索全部历史。

### Phase 4 — 更多 Agents + ACP（3-5 天）

- [x] Codex CLI agent
- [x] OpenCode CLI agent
- [x] Gemini CLI agent
- [x] CLI agent 输出归一化（structured JSON / linewise JSON / event stream）
- [x] **ACP Client 实现**
- [x] ACP agent 配置 + 调用
- [ ] Agent Router 智能路由

**交付**：5 个 CLI/API agent + ACP agent 全部可用。

### Phase 5 — macOS + Browser（2-3 天）

- [ ] 屏幕截图 + OCR
- [ ] 鼠标键盘模拟
- [ ] 应用控制
- [ ] Playwright 集成
- [ ] **`willclaw logs`** — tail 日志

补充进度：

- [x] Browser host tool provider 顺序（`agent-browser -> system-open`）
- [x] Screen host tool provider 顺序（`peekaboo -> screencapture`）
- [x] 最小 browser open / screen capture 宿主工具封装
- [x] 结构化 browser hosted actions：`snapshot / click / type / screenshot`
- [x] 结构化 screen hosted actions：`see / click / type / press`
- [x] `/api/tools/browser/*` + `/api/tools/screen/*`
- [x] `launch-agent install / uninstall / status / print`（登录自启，不走 daemon 命名）

**交付**：登录自启、宿主 browser/screen 可行动、macOS 更完整控制。

### Phase 6 — 打磨（持续）

- [ ] WillClaw 作为 ACP Server
- [ ] 飞书适配器
- [ ] Web UI 美化
- [ ] Tailscale 远程访问
- [ ] `/mode` 工作模式切换
- [ ] 日志保留策略（自动清理 > 90 天）
- [ ] historyMessages git auto-commit（可选）
- [ ] 搜索结果高亮 + 分页

---

## 13. 安全设计

- **无远程技能加载**：不从任何远程源安装技能
- **无插件系统**：没有 hook 可被劫持
- **Web UI 不暴露公网**：默认 127.0.0.1
- **ACP Server 默认关闭**：需要手动开启
- **内置工具层禁用 `rm` / `rmdir`**：删除走 `trash`，长期归档走 `archive`
- **内置工具层危险命令需确认**：`dd`、`mkfs`、高风险 `chmod/chown` 等
- **外部 CLI agent 不做虚假安全承诺**：WillClaw 不能完全拦截其内部子进程行为
- **Token 认证**：Web UI / REST / ACP Server
- **用户白名单**：Telegram / Discord 基于 user ID

---

## 14. 开放问题

1. **CLI Agent stdout 解析**：各 agent 输出格式不同（纯文本 / JSON / ANSI），需逐个适配
2. **ACP 协议版本**：ACP 已与 A2A 合并，需关注协议走向，初期实现核心 REST 端点即可
3. **多会话隔离**：每个 `(channel, chatId)` 是独立会话
4. **WORK_MODES.md 切换机制**：是在 config 中定义模式列表，还是纯文件驱动？初期纯文件
5. **Heartbeat vs Cron 的边界**：Heartbeat 读文件执行，Cron 执行 config 中的 prompt——两者可以并存
6. **FTS5 中文分词**：SQLite 内置 `unicode61` tokenizer 对中文是按字切分（单字索引），精度够用但不如 jieba。如果搜索质量不够，后期可考虑 simple tokenizer + 外部分词
7. **historyMessages 磁盘占用**：长期运行会积累大量 md 文件。初期不做自动清理，靠 git + 手动归档。后期可加自动归档（> 30 天的压缩/移到 archive/）
8. **Tool Logger 对 CLI agent 内部操作的可见性**：WillClaw 只能记录自己工具层的调用。CLI agent（Claude Code / Codex）内部执行的 shell 命令对 WillClaw 不可见——这是设计如此，不试图拦截子进程的子进程
9. **launchd 环境变量**：launchd 启动的进程不继承 shell profile，需要在 plist 或 .env 中显式设置所有需要的环境变量（包括 PATH、API keys）
10. **append-only 导出与撤回体验**：historyMessages 会保留原始文本并追加 tombstone；如果后续想做“导出文件也隐藏原文”，需要引入按消息 ID 重写文件的机制

---

## 15. 命名

- **项目名**：WillClaw
- **CLI 命令**：`willclaw`
- **Workspace**：`~/.willclaw/`
- **默认端口**：8420
- **ACP Server 端口**：8421
- **GitHub**（未来）：`willclaw/willclaw`
