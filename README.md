# @tintinweb/pi-subagents

一个 [pi](https://pi.dev) 扩展,为 pi 带来 **Claude Code 风格的自主子代理**:生成运行在隔离会话中的专用代理,默认后台运行、完成时通知,可中途引导(steer)、可恢复(resume)。

> 本仓库是上游 `@tintinweb/pi-subagents` 的个人精简 fork,只保留 `general-purpose` 与 `Explore` 两个内嵌代理类型。两轮收窄的决策与理由见 [ADR 0001](docs/adr/0001-personal-fork-scope.md) 与 [ADR 0002](docs/adr/0002-second-round-narrowing.md)。

## 功能特性

- **Claude Code 观感** — 相同的工具名称与调用约定:`Agent`、`get_subagent_result`、`steer_subagent`
- **并行后台代理** — 并发上限可配置(默认 10),多余代理自动排队;同一轮生成的多个代理,完成通知合并为一条(智能汇聚,固定行为)
- **实时小组件** — 编辑器上方常驻,显示 spinner、工具活动与 token 计数;`/agents → Settings → Widget` 切换 `all` / `background`(默认,隐藏前台运行)/ `off`
- **对话查看器** — `/agents` 中选中代理,打开其实时对话覆盖层;`Enter` 打开输入框内联引导运行中的代理,`x`(按两次确认)停止,`m` 切换 Markdown 渲染(关 / 仅助手文本 / 全部)
- **会话恢复** — `resume` 参数从代理上次停下的地方继续;默认分离恢复并在完成时通知,`run_in_background: false` 可阻塞并内联取结果
- **严格类型分派** — `subagent_type` 必须精确匹配一个可用类型;未知类型直接报错并列出可用类型,不回退、不大小写折叠
- **优雅轮次上限** — 到达上限先注入收尾警告,产出干净的局部结果而非被截断的输出

## 安装

```sh
pi install git:github.com/asiazhang/pi-subagents
```

或临时试用(不写入设置):

```sh
pi -e git:github.com/asiazhang/pi-subagents
```

更新已安装的扩展(拉取远程最新代码):

```sh
pi update --extension git:github.com/asiazhang/pi-subagents
```

需要 pi **1.0.0 或更新版本(需要 Node.js ≥ 22.19)**(`peerDependencies` 已声明)。

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

后台运行:调用立即返回一个 ID,完成通知附结果预览(`get_subagent_result` 取全文)。传 `run_in_background: false` 可阻塞直到代理完成,并内联获得其完整输出。

## 代理类型

只有两个内置类型,内嵌在扩展中:

| 类型 | 工具 | 模型 | 提示词模式 | 描述 |
|------|-------|-------|-------------|-------------|
| `general-purpose` | 全部 7 个内置工具 + 全部扩展工具 | 继承父级 | `append`(父级孪生) | 继承父级的完整系统提示词——同样的规则、CLAUDE.md、项目约定 |
| `Explore` | read, bash, grep, find, ls | `opencode-go/claude-haiku-5-5`(未配置时回退继承父级) | `replace`(独立) | 快速只读代码探索 |

`general-purpose` 是**父级孪生**——接收父级的完整系统提示词,外加一个子代理上下文桥接,因此遵循与父级相同的规则。`Explore` 使用为其只读角色定制的独立提示词,并钉死一个快速便宜的模型;模型必须以精确的 `provider/modelId` 解析,解析不到(如提供方未配置)则回退继承父级模型。

### 类型分派

`subagent_type` 必须**精确匹配**一个可用类型(区分大小写)。匹配失败——未知类型、拼写错误、缺失——生成被拒绝,错误列出全部可用类型。没有回退代理,也没有大小写折叠:类型分派是唯一决定生成哪个代理的地方,猜测只会掩盖调用方的错误。

`Agent` 工具描述动态列出可用类型及其 `(Tools: …)` 后缀,编排者读这个后缀路由工作。后缀只描述**内置工具**作用域(见下节)。

### 工具呈现语义

代理类型可以声明一个内置工具列表,也可以省略。语义是二态的:

- **声明了列表 = 精确白名单。** 代理恰好呈现所列的内置工具,不多不少;扩展工具一概不呈现。扩展**仍然加载**——它们的事件钩子和非工具副作用照常活跃,只是工具不进入代理的工具集。
- **省略列表 = 全量。** 全部 7 个内置工具,加上所有扩展提供的工具。

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

## 并发与完成通知

单一后台池(`maxConcurrent`,默认 10):多余的代理自动排队,等运行中的代理完成后启动。前台代理(`run_in_background: false`)不占池——它阻塞父级,而 pi 经 `Promise.all` 分派同一条消息的工具调用,本来就同时运行。后台恢复占一个池;前台恢复重开现有会话,不走生成路径。

后台代理完成时通知主代理。同一轮生成的 2 个以上代理自动合并为一条通知(全部完成或 30 秒超时,以先到者为准;超时先送达已完成结果,掉队者完成后再以 15 秒窗口补发)。单独生成的代理逐个通知。

## 持久化设置

通过 `/agents` → Settings 设置的运行时调优值持久化在 `<cwd>/.pi/subagents.json`,跨 pi 重启生效。缺失字段回退硬编码默认:并发 `10`、默认最大轮次无限、宽限轮次 `5`、默认后台开启。

- **`backgroundByDefault`**(默认 `true`)— 一条没说明的 `Agent` 调用意味着什么:开启时代理分离运行,调用立即返回 ID;设 `false` 则未限定的生成阻塞轮次并内联返回输出。调用上显式的 `run_in_background` 双向覆盖。
- **`rememberAgents`**(默认 `true`) - 子代理是否持久化其 pi 会话;开启时在 pi 的 `/resume` 中嵌套于生成它们的会话之下。
- **`outputTranscript`**(默认 `true`)— 是否写出每个子代理的 `.output` 转录。转录写在共享临时目录下的 `pi-subagents-<uid>/` 根中,该根强制 `0700`(仅所有者可读;Windows 上跳过 chmod)。

```bash
mkdir -p .pi
cat > .pi/subagents.json <<'SETTINGS_EOF'
{
  "maxConcurrent": 16,
  "graceTurns": 10
}
SETTINGS_EOF
```

**失败行为:** 缺文件静默;格式错误的 JSON 向 stderr 警告并整体忽略;无效/越界的字段值逐字段丢弃;写入失败把 `/agents` toast 降级为带 `(session only; failed to persist)` 的警告。

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
