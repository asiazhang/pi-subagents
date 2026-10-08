# @tintinweb/pi-subagents

一个 [pi](https://pi.dev) 扩展,为 pi 带来 **Claude Code 风格的自主子代理**。生成运行在隔离会话中的专用代理——每个代理拥有自己的工具、系统提示词、模型和思考级别。默认在后台运行(也可阻塞等待),可在运行中途引导(steer),可恢复已完成的会话。

> 本仓库是上游 `@tintinweb/pi-subagents` 的个人精简 fork:面向单机 TUI 使用。第一轮收窄删除了工作流引擎、调度、跨扩展 RPC、Agent 提及、worktree 隔离、持久化记忆与技能预加载([ADR 0001](docs/adr/0001-personal-fork-scope.md));第二轮收窄删除了自定义代理文件、嵌套子代理、模型范围、前台并发池、回退解析,只保留 `general-purpose` 与 `Explore` 两个内置类型([ADR 0002](docs/adr/0002-second-round-narrowing.md))。

<img width="600" alt="pi-subagents screenshot" src="https://github.com/tintinweb/pi-subagents/raw/master/media/screenshot.png" />

https://github.com/user-attachments/assets/8685261b-9338-4fea-8dfe-1c590d5df543

## 功能特性

- **Claude Code 观感** — 相同的工具名称、调用约定和 UI 模式(`Agent`、`get_subagent_result`、`steer_subagent`)——感觉浑然一体
- **并行后台代理** — 生成多个并发运行的代理,带自动排队(并发上限可配置,默认 10)与智能分组汇聚(同一轮生成的代理合并为一条完成通知)
- **实时小组件 UI** — 编辑器上方的常驻小组件,带动画 spinner、实时工具活动、token 计数和彩色状态图标。通过 `/agents → Settings → Widget` 配置:`all`(所有代理)、`background`(默认——隐藏前台运行,前台运行本就以 `Agent` 工具结果的形式内联渲染),或 `off`
- **对话查看器** — 在 `/agents` 中选中任意代理,打开其实时滚动的完整对话覆盖层(自动跟随新内容,向上滚动即暂停)。对运行中的代理,按 `Enter` 打开输入框,输入后按 `Enter` 发送即可内联引导(`Esc` 或空提交则返回)——消息以用户消息的形式出现,并在代理当前工具执行完后改变其工作方向。按 `x`(再按一次 `x` 确认)可停止仍在运行的代理——对后台代理同样有效。助手文本以 Markdown 渲染;`m` 可在会话内于关闭、仅助手文本与全部之间切换
- **运行中引导** — 向运行中的代理注入消息以改变其工作方向,无需重启
- **会话恢复** — 从代理上次停下的地方继续,保留完整对话上下文。默认以分离方式恢复并在完成时通知你,与全新生成一样;传 `run_in_background: false` 可阻塞并内联获得结果
- **严格类型分派** — `subagent_type` 必须精确匹配一个可用类型;未知类型直接报错并列出可用类型,不回退、不猜测
- **优雅轮次上限** — 代理在硬中止前会收到"收尾"警告,产出干净的局部结果而非被截断的输出
- **美化的完成通知** — 后台代理结果渲染为主题化的紧凑通知框(图标、统计、结果预览)而非原始 XML。可展开显示完整输出。分组完成时逐个渲染每个代理

## 安装

```bash
pi install npm:@tintinweb/pi-subagents
```

或开发时直接加载:

```bash
pi -e ./src/index.ts
```

需要 pi **0.84.0 或更新版本**(`peerDependencies` 已声明)。

### 其他宿主

本扩展针对 [pi](https://pi.dev) 开发和测试。

第三方适配器报告了在别处运行它的方法。这些项目独立于本项目维护:未经此处测试,不在我们的 CI 覆盖范围内,兼容性可能随任何版本发布而破坏。

- **DeepSeek Harness (`dsh`)** — 通过一个把 pi 宿主 API 映射到原生 DSH 代理的适配器。详情与反馈:[#258](https://github.com/tintinweb/pi-subagents/issues/258)

## 快速开始

父代理使用 `Agent` 工具生成子代理:

```
Agent({
  subagent_type: "Explore",
  prompt: "Find all files that handle authentication",
  description: "Find auth files",
  run_in_background: true,
})
```

代理默认在后台运行:调用立即返回一个 ID,完成时通知你,并附结果预览(用 `get_subagent_result` 获取全文)。传 `run_in_background: false` 可阻塞直到代理完成,并内联获得其完整输出。

## 界面

扩展在编辑器上方渲染一个常驻小组件,显示活动代理。默认只显示后台运行(`widgetMode: background`)——前台代理本就内联渲染为 `Agent` 工具结果,否则小组件会重复渲染它们。通过 `/agents → Settings → Widget` 切换为 `all`(所有代理)或 `off`(隐藏小组件):

```
● Agents
├─ ⠹ Agent  Refactor auth module · ↻5≤30 · 5 tool uses · 33.8k token (62%) · 12.3s
│    ⎿  editing 2 files…
├─ ⠹ Explore  Find auth files · ↻3 · 3 tool uses · 12.4k token (8%) · 4.1s
│    ⎿  searching…
├─ ⠹ Agent  Long-running task · ↻42 · 38 tool uses · 91.0k token (84% · ⇊2) · 2m17s
│    ⎿  reading…
└─ 2 queued
```

token 字段在括号内带两个可选信号:
- **`NN%`** — 上下文窗口占用率(按颜色区分:<70% 暗淡,70–85% 警告,≥85% 错误)。模型未声明 `contextWindow` 时省略,或紧随压缩之后短暂省略。
- **`⇊N`** — 会话被压缩的次数(大于 0 时显示)。保持暗淡;紧急程度由百分比的颜色承载。

## 代理类型

只有两个内置类型,内嵌在扩展中:

| 类型 | 工具 | 模型 | 提示词模式 | 描述 |
|------|-------|-------|-------------|-------------|
| `general-purpose` | 全部 7 个内置工具 + 全部扩展工具 | 继承父级 | `append`(父级孪生) | 继承父级的完整系统提示词——同样的规则、CLAUDE.md、项目约定 |
| `Explore` | read, bash, grep, find, ls | `opencode-go/claude-haiku-5-5`(该模型未配置时回退继承父级) | `replace`(独立) | 快速只读代码探索 |

`general-purpose` 代理是**父级孪生**——它接收父级的完整系统提示词,外加一个子代理上下文桥接,因此遵循与父级相同的规则。Explore 使用为其只读角色定制的独立提示词,并钉死一个快速便宜的模型;模型必须以精确的 `provider/modelId` 解析,解析不到(如提供方未配置)则回退继承父级模型。

### 类型分派

`subagent_type` 必须**精确匹配**一个可用类型(区分大小写)。匹配失败——未知类型、拼写错误、缺失——生成被拒绝,错误列出全部可用类型。没有回退代理,也没有大小写折叠:类型分派是唯一决定生成哪个代理的地方,猜测只会掩盖调用方的错误。

`Agent` 工具描述动态列出可用类型及其 `(Tools: …)` 后缀,编排者读这个后缀路由工作。后缀只描述**内置工具**作用域(见下节)。

### 工具呈现语义

代理类型可以声明一个内置工具列表,也可以省略。语义是二态的:

- **声明了列表 = 精确白名单。** 代理恰好呈现所列的内置工具,不多不少;扩展工具一概不呈现。扩展**仍然加载**——它们的事件钩子和非工具副作用照常活跃,只是工具不进入代理的工具集。
- **省略列表 = 全量。** 全部 7 个内置工具,加上所有扩展提供的工具。

两个内置类型正好各占一态:`general-purpose` 省略(全量),`Explore` 声明白名单(只读五件套)。

## 工具

### `Agent`

启动一个子代理。

| 参数 | 类型 | 必填 | 描述 |
|-----------|------|----------|-------------|
| `prompt` | string | 是 | 代理的任务 |
| `description` | string | 是 | 3-5 词的简短摘要(显示在 UI 中) |
| `subagent_type` | string | 是 | 代理类型,必须精确匹配(见[类型分派](#类型分派)) |
| `model` | string | 否 | 模型——精确的 `provider/modelId`;省略用代理类型的默认(类型钉死了模型时,调用方无法覆盖) |
| `thinking` | string | 否 | 思考级别:off, minimal, low, medium, high, xhigh, max(可用性取决于 pi 版本和模型) |
| `max_turns` | number | 否 | 最大代理轮次。省略表示无限(默认) |
| `run_in_background` | boolean | 否 | 默认 `true`;`false` 阻塞并内联返回结果 |
| `resume` | string | 否 | 要恢复先前会话的代理 ID |

### `get_subagent_result`

检查状态并从后台代理取回结果。

| 参数 | 类型 | 必填 | 描述 |
|-----------|------|----------|-------------|
| `agent_id` | string | 是 | 要检查的代理 ID |
| `wait` | boolean | 否 | 等待完成 |
| `verbose` | boolean | 否 | 包含完整对话日志 |

取消 `wait: true` 调用(例如按 `Esc`)只停止等待。后台代理继续运行,其完成通知照常送达。

### `steer_subagent`

向运行中的代理发送引导消息。消息在当前工具执行完后中断。

| 参数 | 类型 | 必填 | 描述 |
|-----------|------|----------|-------------|
| `agent_id` | string | 是 | 要引导的代理 ID |
| `message` | string | 是 | 注入代理对话的消息 |

## 命令

| 命令 | 描述 |
|---------|-------------|
| `/agents` | 交互式代理管理菜单——运行中的代理、设置 |

## 优雅轮次上限

不在轮次上限处硬中止,而是让代理优雅停机:

1. 到达 `max_turns` — 引导消息:*"Wrap up immediately — provide your final answer now."*
2. 最多 5 个宽限轮次来完成收尾
3. 宽限期过后才硬中止

| 状态 | 含义 | 图标 |
|--------|---------|------|
| `completed` | 自然完成 | `✓` 绿色 |
| `steered` | 触及上限,及时收尾 | `✓` 黄色 |
| `aborted` | 超出宽限期 | `✗` 红色 |
| `stopped` | 用户发起的中止 | `■` 暗淡 |

## 并发

单一后台池(`maxConcurrent`,默认 10)。多余的代理自动排队,等运行中的代理完成后启动。小组件把排队的代理显示为折叠计数。由于代理默认后台运行,几乎每次生成都占一个槽;上限从 4 提高,以免普通的并行扇出排队。

前台代理不占池:它阻塞父级——父级本可以自己做那份工作而不必花一个槽——而 pi 经 `Promise.all` 分派一条消息的工具调用,一条消息里多个 `run_in_background: false` 的调用本来就同时运行。

后台恢复(`resume`)像其他后台代理一样占一个槽、参与排队;前台恢复重新打开现有会话,不走生成路径,不受池约束。

## 完成通知的汇聚

后台代理完成时通知主代理。同一轮生成的 2 个以上后台代理自动合并为一条通知(全部完成或 30 秒超时,以先到者为准;超时发送已完成结果的部分通知,掉队者完成后再以更短的 15 秒窗口补发)。单独生成的代理逐个通知。此行为固定,不可配置。

## 持久化设置

通过 `/agents` → Settings 设置的运行时调优值(最大并发、默认最大轮次、宽限轮次、默认后台、输出转录、记住代理、小组件 all/background/off)跨 pi 重启持久化。单一文件:`<cwd>/.pi/subagents.json`(本 fork 删除了全局层)。

**优先级:** 缺失字段回退到硬编码默认值(最大并发 `10`、默认最大轮次无限、宽限轮次 `5`、默认后台开启)。

**默认后台**(`backgroundByDefault`,默认 `true`):一条没说明的 `Agent` 调用意味着什么。开启时——跟随 Claude Code——代理分离运行,调用立即返回其 ID,完成通知附结果预览(`get_subagent_result` 取全文)。设 `false` 恢复先前的行为:未限定的生成阻塞轮次并内联返回输出。调用上显式的 `run_in_background` 双向覆盖此设置;该设置只决定"未指定"意味着什么。通过 `/agents` → Settings → Background by default 切换;实时生效。

**记住代理**(`rememberAgents`,默认 `true`):子代理是否持久化其 pi 会话。开启时顶层子代理写会话文件,并在 pi 的 `/resume` 中嵌套于生成它们的会话之下。通过 `/agents` → Settings → Remember agents 切换。

**输出转录**(`outputTranscript`,默认 `true`):写出每个子代理 `.output` 转录的项目默认。转录写在共享临时目录下的 `pi-subagents-<uid>/` 根中,该根强制 `0700`(仅所有者可读;chmod 在 Windows 上跳过)——转录含完整对话,这个模式是它们不暴露给本机其他用户的唯一保证。通过 `/agents` → Settings → Output transcript 切换,或在 `subagents.json` 中设 `false` 让转录项目级变为可选——当运行转录不该留在磁盘上时有用。只管理转录,不管会话持久化。

**示例——高配机器上的默认值:**

```bash
mkdir -p .pi
cat > .pi/subagents.json <<'SETTINGS_EOF'
{
  "maxConcurrent": 16,
  "graceTurns": 10
}
SETTINGS_EOF
```

现在本项目以并发 16、宽限 10 起步,完全不用碰菜单。

**失败行为:** 缺文件静默;格式错误的 JSON 向 stderr 记录 `[pi-subagents] Ignoring malformed settings at …` 警告;无效/越界的字段值逐字段丢弃;写入失败把 `/agents` toast 降级为带 `(session only; failed to persist)` 的警告。


## 架构

```
docs/
  adr/                # 决策记录(0001/0002:个人 fork 的两轮功能面收窄)
test/                 # vitest 套件;e2e/ 子目录
src/
  index.ts            # 扩展入口:工具/命令注册、/agents 菜单、渲染
  types.ts            # 类型定义(AgentConfig、AgentRecord 等)

  # 代理注册表
  default-agents.ts   # 内嵌默认代理配置(general-purpose、Explore)
  agent-types.ts      # 静态类型注册表 + 严格 resolveSpawnType

  # 执行
  agent-runner.ts     # 会话创建、执行、优雅 max_turns、引导/恢复、工具呈现作用域
  agent-manager.ts    # 代理生命周期、并发队列、完成通知
  child-context.ts    # AsyncLocalStorage 标志,标记为子会话完成的工作
  abortable.ts        # 把等待与 Esc 竞速,而不取消后台子代理
  group-join.ts       # 分组汇聚管理器:带超时的批量完成通知(smart,钉死)
  status-note.ts      # 非正常结果的诚实状态注记 + 抢救的部分输出
  usage.ts            # token 用量形状、累加器、会话统计读取器

  # 调用面
  invocation-config.ts # 共享调用参数解析(model/thinking/max_turns/run_in_background)
  model-resolver.ts   # 模型解析:精确 provider/modelId

  # 上下文与环境
  output-file.ts      # 代理会话的流式输出文件转录
  prompts.ts          # 配置驱动的系统提示词构建器
  context.ts          # 从父对话提取文本(上下文桥接)
  settings.ts         # 持久化设置(<cwd>/.pi/subagents.json)
  env.ts              # 环境检测(git、平台)
  xml.ts              # 完成通知的 XML 载荷编解码

  ui/
    agent-widget.ts       # 常驻小组件:spinner、活动、状态图标、主题
    conversation-viewer.ts # 查看代理会话的实时对话覆盖层
    viewer-keys.ts        # 经用户键位解析的查看器滚动键
    select-item.ts        # 防冲突的 ctx.ui.select 包装(编号行)
```


## 许可证

MIT — [tintinweb](https://github.com/tintinweb)
