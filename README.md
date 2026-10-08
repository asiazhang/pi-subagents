# @tintinweb/pi-subagents

一个 [pi](https://pi.dev) 扩展,为 pi 带来 **Claude Code 风格的自主子代理与工作流编排**。生成运行在隔离会话中的专用代理——每个代理拥有自己的工具、系统提示词、模型和思考级别。默认在后台运行(也可阻塞等待),可在运行中途引导(steer),可恢复已完成的会话,还能定义自定义代理类型。当编排不该即兴发挥时,把确定性的 JavaScript 脚本交给 `SubagentWorkflow` 工具——`agent()`、`parallel()`、`pipeline()`——为 Claude Code 的 `Workflow` 工具编写的脚本在这里原样运行。

<img width="600" alt="pi-subagents screenshot" src="https://github.com/tintinweb/pi-subagents/raw/master/media/screenshot.png" />


https://github.com/user-attachments/assets/8685261b-9338-4fea-8dfe-1c590d5df543

<img width="600" alt="pi-color-badges-white" src="https://github.com/user-attachments/assets/555dcae4-333e-4ff0-b420-7b3369c018a4" />


## 功能特性

- **Claude Code 观感** — 相同的工具名称、调用约定和 UI 模式(`Agent`、`get_subagent_result`、`steer_subagent`)——感觉浑然一体
- **并行后台代理** — 生成多个并发运行的代理,带自动排队(并发上限可配置,默认 10)与智能分组汇聚(合并通知)
- **实时小组件 UI** — 编辑器上方的常驻小组件,带动画 spinner、实时工具活动、token 计数和彩色状态图标。通过 `/agents → Settings → Widget` 配置:`all`(所有代理)、`background`(默认——隐藏前台运行,前台运行本就以 `Agent` 工具结果的形式内联渲染),或 `off`
- **FleetView** — Claude Code 风格的可导航列表,渲染在编辑器下方,列出 `main` 与每个正在运行的子代理(按启动先后排序)。在空提示符处按 `↓`(或 `←`)进入列表,`↑`/`↓` 移动选择,`Enter` 打开所选代理的实时自动更新对话,`Esc` 返回。已完成的代理会短暂停留后才消失,查看器在代理完成后保持打开,方便阅读最终输出。通过 `/agents → Settings → Fleet view` 开关
- **对话查看器** — 在 `/agents` 中选中任意代理,打开其实时滚动的完整对话覆盖层(自动跟随新内容,向上滚动即暂停)。对运行中的代理,按 `Enter` 打开输入框,输入后按 `Enter` 发送即可内联引导(`Esc` 或空提交则返回)——消息以用户消息的形式出现,并在代理当前工具执行完后改变其工作方向。按 `x`(再按一次 `x` 确认)可停止仍在运行的代理——对后台代理同样有效。助手文本以 Markdown 渲染;`m` 可在关闭、仅助手文本与全部之间切换(见[查看器 Markdown](#持久化设置))
- **自定义代理类型** — 在 `.pi/agents/<name>.md`、`.agents/agents/<name>.md`(项目级)或全局位置定义代理,支持 YAML frontmatter:自定义系统提示词、模型选择、思考级别、工具限制,以及与 Claude Code 兼容的彩色名称徽章
- **嵌套子代理** — 可选、默认关闭的委派机制:设置 `allowed_subagents` 的自定义代理会获得自己的、按所有权限定作用域的 `Agent`、`get_subagent_result` 和 `steer_subagent` 工具,从主会话起算深度上限(默认 2)。它只能控制自己的子代理,子代理随它结束而停止,其转录与 token 消耗向上汇总到它。允许列表是一道权限边界——子代理以自己的工具运行,所以要像选择 `tools:` 一样慎重
- **Agent 提及** — 子代理是一等公民:在提示符处输入 `@explore also check the RPC path`,消息会发给该代理而非主模型,且不会有一个字进入聊天。一种语法覆盖其整个生命周期——运行中发消息、结束后恢复、很久之后从磁盘重新打开其会话,或从未运行过则启动它。提及一个未运行的代理会通过屏幕外的对话克隆启动它,使其获得 Claude Code 式由上下文写就的提示词和真实的 `Agent` 工具调用,同样不进入聊天;`direct` 模式则直接在此以你的文本启动,完全不调用模型。编排者可用 `name` 给代理命名,让你以 `@auth-audit` 称呼它;`steer_subagent`/`get_subagent_result` 中的句柄同样有效。`@` 补全运行中的代理、可恢复的代理和可启动的类型,与 pi 的文件补全并列;`@main` 强制文本回到主模型。通过 `/agents → Settings → Agent mentions` 开关
- **脚本化工作流** — `SubagentWorkflow` 工具运行确定性的 JavaScript 脚本来编排多个子代理:`agent()`、`parallel()`、`pipeline()`、`phase()`、`log()` 和 `args`,配一个纯字面量的 `meta` 块声明各阶段。`pipeline()` 的阶段之间没有栅栏,一个条目可以进入后续阶段而另一个还在第一阶段——不像 `parallel()`,它会让所有快的代理闲置到最慢的完成为止。在后台运行并带实时卡片,可通过 `/agents → Workflows` 或在 FleetView 中选中该运行来查看。`agent()` 还接受 `gate: "npm test"`,通过运行命令(隔离时在其 worktree 内)而非询问另一个模型来校验子代理;以及 `resume: "<label>"` 续用子代理而非重复支付其上下文。脚本运行在 worker 线程上的 `node:vm` 沙箱中,其中 `Date.now()`、`Math.random()` 和 `eval` 都会抛错。默认开启,但遇到同行会让位:若另一个扩展已提供 `Workflow` 或 `SubagentWorkflow` 工具,本扩展会警告并在本会话内自我禁用,而不是给模型两个编排器。无论哪种情况都可用 `subagents.json` 中的 `"workflowsEnabled"` 或 `/agents → Settings → Workflows` 钉死。为 Claude Code 的 `Workflow` 工具编写的脚本在这里原样运行:相同的全局变量,`schema` 与那边完全一样返回校验过的对象,`budget` 存在且始终报告无 token 目标(pi 没有该指令),因此其 `budget.total` 守卫模式仍走为它们编写的分支;嵌套 `workflow()` 可组合已保存的工作流(一层深)。**[完整指南](https://github.com/tintinweb/pi-subagents/blob/master/docs/workflows.md)**
- **运行中引导** — 向运行中的代理注入消息以改变其工作方向,无需重启
- **会话恢复** — 从代理上次停下的地方继续,保留完整对话上下文。默认以分离方式恢复并在完成时通知你,与全新生成一样;传 `run_in_background: false` 可阻塞并内联获得结果
- **优雅轮次上限** — 代理在硬中止前会收到"收尾"警告,产出干净的局部结果而非被截断的输出
- **大小写不敏感的代理类型** — `"explore"`、`"Explore"`、`"EXPLORE"` 均可。无法唯一解析到一个*已启用*代理的类型——未知、已禁用,或仅在大小写上不同的两个代理之间有歧义——会回退到 general-purpose 并附注说明,或在 [`fallbackSubagent: none`](#持久化设置) 下直接拒绝
- **模糊模型选择** — 按名称指定模型(`"haiku"`、`"sonnet"`)而非完整 ID,并自动过滤到仅可用/已配置的模型
- **上下文继承** — 可选择将父对话 fork 进子代理,让它知道已经讨论过什么
- **持久化代理记忆** — 三种作用域(项目、本地、用户),对没有写工具的代理自动只读回退
- **Git worktree 隔离** — 在隔离的仓库副本中运行代理;完成后更改自动提交到分支
- **技能预加载** — 将具名技能注入代理系统提示词,从 `.pi/skills/`、`.agents/skills/` 和全局位置发现(支持 Pi 标准的 `<name>/SKILL.md` 目录布局)
- **工具拒绝列表** — 通过 `disallowed_tools` frontmatter 阻止特定工具
- **美化的完成通知** — 后台代理结果渲染为主题化的紧凑通知框(图标、统计、结果预览)而非原始 XML。可展开显示完整输出。分组完成时逐个渲染每个代理
- **事件总线** — 生命周期事件(`subagents:created`、`started`、`completed`、`failed`、`steered`、`compacted`)经 `pi.events` 发出,其他扩展可据此响应子代理活动
- **跨扩展 RPC** — 其他 pi 扩展可经由 `pi.events` 事件总线生成、停止和等待子代理(`subagents:rpc:ping`、`subagents:rpc:spawn`、`subagents:rpc:stop`、`subagents:rpc:consume`)。标准化的应答信封与协议版本。会话启动时发出 `subagents:ready`。**[完整参考](https://github.com/tintinweb/pi-subagents/blob/master/docs/rpc.md)**
- **调度子代理** — 给 `Agent` 工具传 `schedule` 即可按 cron / 间隔 / 单次触发。会话级任务,带 PID 锁持久化;结果通过与手动后台完成相同的 `subagent-notification` followUp 路径送达;通过 `/agents → Scheduled jobs` 管理
- **模型范围强制** — 可选开启的校验,确保子代理的模型选择保持在你的 pi `enabledModels` 允许列表内(来源为 `/scoped-models`,同时尊重全局与项目本地 pi 设置)。调用方传入超范围模型 → 向编排者报硬错误;frontmatter 钉死的超范围模型 → 警告并照常运行(frontmatter 是权威)。通过 `/agents → Settings → Scope models` 开关

## 安装

```bash
pi install npm:@tintinweb/pi-subagents
```

或开发时直接加载:

```bash
pi -e ./src/index.ts
```

需要 pi **0.84.0 或更新版本**:[`SubagentWorkflow`](#subagentworkflow) 工具构建于 `constrainedSampling`(pi 0.82.0)和 pi-tui 的 `stripTerminalSequences`(0.84.0)之上。`peerDependencies` 范围已声明这一点,因此 npm 会在安装时对旧版 pi 报警。

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

### 调度

添加 `schedule` 字段,把代理注册为稍后触发而非立即运行:

```
Agent({
  subagent_type: "Explore",
  prompt: "Look at recent commits and summarize what changed since last week",
  description: "Weekly commit review",
  schedule: "0 0 9 * * 1",   // 9am every Monday (6-field cron)
})
```

调度格式:

- **Cron** — 6 字段(`秒 分 时 日 月 星期`),例如 `"0 0 9 * * 1"` 表示每周一早上 9 点,`"0 */15 * * * *"` 表示每 15 分钟。
- **间隔** — `"5m"`、`"1h"`、`"30s"`、`"2d"`。按该间隔反复触发。
- **单次相对** — `"+10m"`、`"+2h"`、`"+1d"`。在该未来时刻触发一次。
- **单次绝对** — 完整 ISO 时间戳,例如 `"2026-12-25T09:00:00.000Z"`。

调度触发时,生成以后台方式运行,完成通知通过与手动生成的后台代理相同的 `subagent-notification` followUp 路径进入对话——父代理以同样的方式推理结果。

调度是**会话级**的:`/new` 时重置,`/resume` 时恢复。通过 `/agents → Scheduled jobs` 列出和取消(创建是 `Agent` 工具的职责——没有并行的手动创建向导)。存储在 `<cwd>/.pi/subagent-schedules/<sessionId>.json`,带基于 PID 的文件锁以保证跨实例安全。

**完全禁用该功能**:`/agents → Settings → Scheduling → disabled` 会从 `Agent` 工具 spec 中移除 `schedule`(不占 LLM 上下文)、隐藏菜单项并停止任何活动调度器。schema 级移除在下一个 pi 会话生效;运行时停用立即生效。可从同一菜单重新启用。

限制:
- `schedule` 不能与 `inherit_context`(触发时不存在父对话)或 `resume`(调度创建全新代理)组合。
- `run_in_background: false` 会被拒绝——调度任务始终后台运行。省略或传 `true` 都可以。
- 调度触发绕过 `maxConcurrent` 队列,这样 5 分钟间隔的任务不会被长时间运行的手动代理拖到队尾。
- **无头 `pi -p` 不会等待调度的子代理。**

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

### FleetView

子代理运行期间,一个 Claude Code 风格的可导航列表渲染在编辑器**下方**:

```
  esc to interrupt · ← for agents · ↓ to manage

  ● main
  ○ workflow         audit-src                    12/40 agents · 32s · ↓ 26.4k tokens
  ○ general-purpose  Sleep then report 1                                11s · ↓ 13.1k tokens
  ○ general-purpose  Sleep then report 2                                11s · ↓ 13.1k tokens
                                                                                   ↓ 3 more
```

运行中的[工作流](#subagentworkflow)在代理上方显示为单独一行 `workflow`,以其代理数量代替描述。在其上按 `Enter` 会打开与 `/agents → Workflows` 相同的双栏检查器,而非对话覆盖层。某次运行自己的代理*不会*单独列出——它们属于该运行、由运行代为汇报,因此会像嵌套子代理一样被从 fleet 列表、编辑器上方小组件、`/agents` 菜单和 `@句柄` 解析中过滤掉。它们也不占用 `maxConcurrent` 池:运行有自己的并发上限,把扇出同时路由进会话池,会让一个工作流饿死其他一切。代理按启动先后排序,且只显示你真正能打开的代理(尚无会话的 pending/排队代理在启动后出现)。在**空提示符**处按 `↓`(或 `←`)把焦点从提示符移入列表——选中行标记 `●`,其余 `○`。选中行以主题主文本色渲染,而非其他行的弱化/暗淡处理;配置了 `color` 的代理还会在此显示加粗的徽章。`↑`/`↓` 移动选择,`Enter` 打开所选代理的实时对话覆盖层(随代理工作自动更新),`Esc`(或在 `main` 之上按 `↑`)返回提示符。选中 `main` 返回普通视图。覆盖层内按 `Enter` 引导运行中的代理——输入消息后按 `Enter` 发送(`Esc` 或空提交返回),它以与 `steer_subagent` 工具相同的方式改变代理方向。查看器在其代理完成后保持打开,方便阅读最终输出;已完成的代理在列表中停留数秒后消失。在非空提示符处输入任何内容都表现正常——列表只在提示符为空时捕获方向键。通过 `/agents → Settings → Fleet view` 完全禁用。

### Agent 提及

子代理是可寻址的。每个代理都有一个可输入的句柄——代理类型的小写形式,实例冲突时加编号(`explore`、`explore-2`)——在提示符处 `@句柄 <消息>` 即可与该代理对话,无论它处于什么状态。输入 `@` 选择一个:

```
❯ @
  @auth-audit     send message · Explore · running · audit the auth flow
  @explore-2      send message · running · find flaky tests
  @code-review    resume · code-review · check the diff
  @architect      start agent · Software architect agent for designing implementation plans.
  index.ts        src/index.ts                        ← pi's own file rows, still there
  index.d.ts      dist/index.d.ts
```

句柄命名的是**代理**而非某个进程,因此一种语法覆盖其整个生命周期:

| 状态 | `@explore fix the flaky test` 会做什么 |
|-------|-----------------------------------|
| 运行中或排队 | 把消息送入其对话,与 `steer_subagent` 完全一样 |
| 已完成 | 在后台**恢复**它,从其现有会话继续上次的工作 |
| 早已完成,记录已被清除 | 从磁盘**重新打开**其会话并继续 |
| 从未启动 | **启动**它——默认通过本对话的克隆([见下](#启动新代理)) |

主对话不花费任何轮次,提及的任何内容也不进入聊天。回答以普通的后台完成通知返回,主模型可以转述它。

#### 启动新代理

Claude Code 自己并不启动被提及的代理。`@agent-<type>` 变成一个*附件*,向你的提示词追加一条 `<system-reminder>`——"用户表达了调用代理 X 的意愿;请适当地调用该代理,并传入所需上下文"——然后由主模型发起工具调用。没有工具强制,也没有 allowed-tools 收窄:提及约束的是*哪个*代理,而不是它被告知什么。因此由模型撰写代理的提示词,赋予它冷启动生成所缺乏的对话上下文。

代价是一次可见的轮次——模型的推理及其工具块,为你打字时已经做出的决定配上旁白。本扩展保留这一机制,但把它移到屏幕外。对话被复制进一个一次性的内存会话,该克隆持有只带 `Agent` 工具的这一轮,它启动的是一个普通的顶层代理:

```
@cyan whats your favorite color        →  (nothing in the chat)
  └─ clone of this conversation, off-screen
       └─ Agent(subagent_type: "cyan", prompt: …)
            ▸ Cyan Agent   favorite color        ← widget, fleet row, handle
```

它是字面意义上的克隆——会话自己的条目和同一份系统提示词,而不是 [`inherit_context`](#frontmatter-字段) 那样的文本转述——取自内存且感知压缩,克隆读到什么,主模型就在以什么为工作基础。克隆只有一个工具和一个任务;它不能读、写或运行任何东西,因为一个带着完整工具集的隐形轮次可能做出隐形的工作。它启动的代理归属*真实*会话,其转录和 `rootSessionId` 落在它们本来就会落的地方,且不携带 `tool-use-id`——主对话从未发出过。

| 模式 | `@architect sketch the migration`(没有同名代理在运行时) |
|------|----------------------------------------------------------|
| `model`(默认) | 本对话的克隆在屏幕外执行这一轮并调用 `Agent`,代理以**从对话写就的**提示词启动。聊天里只会出现一个 `Prompting @architect…` toast——措辞表示正在等待那一轮;`direct` 的 `Started @architect` 则意味着它已在运行 |
| `direct` | 代理在此处立即启动,以你的消息逐字作为其提示词。完全不调用模型,因此启动没有延迟 |
| `off` | `@` 重新只意味着"附加文件" |

无论哪种方式,启动的代理都会遵守自己的 frontmatter——`model:`、`thinking:`、`max_turns:` 全部生效,因为两条路径都不传递它们,代理自身的配置获胜。把提及作为会话的第一件事也有效:本来就没有历史可携带,克隆仍运行在你的模型和系统提示词上。如果它完全无法交付——模型总可以用散文回答而不是调用工具——代理会直接以你的文本启动,toast 会说明这一点,而不是让你两手空空。

`model` 也是唯一在 TUI 之外可用的模式:`pi -p '@architect sketch the migration'` 会克隆、生成并通过普通完成路径汇报,而 direct 启动会分离代理且不打印任何内容。出于同样原因,发消息和恢复在两种模式下都仅限 TUI。

相对 `direct` 要权衡两点:克隆会重发整个对话,且代理要等那一轮结束才启动。

**具名代理。** `Agent` 工具接受可选的 `name`,编排者可以把一个代理命名为 `auth-audit`,而不是让你去分辨 `@explore-2` 和 `@explore-3`。名称是*附加的*:类型派生的句柄仍会被分配,所以 `@explore` 依旧到达那个代理,而不是在旁边再启动一个。两个名字共享一个命名空间——别名永远不会遮蔽活动句柄,反之亦然——弹窗中每个代理一行,显示在其别名下,类型移入描述。`steer_subagent` 和 `get_subagent_result` 也接受句柄,所以你和模型以同样的方式寻址代理。

**很久之后恢复。** 因为子代理会话默认持久化([`rememberAgents`](#持久化设置)),句柄在代理的内存记录被逐出后仍然有效:`@explore anything else?` 会从磁盘重新打开对话。只有*定义*会被重新解析,所以续篇在该代理类型当前的 frontmatter 下运行,而非第一次运行所用的那份。如果该类型此后被删除或禁用,恢复会被拒绝而不是回退到另一个代理——重新启用它,句柄即恢复工作。被逐出代理的名称保持保留,所以之后的 Explore 会成为 `explore-2`,而不是遮蔽你仍能到达的东西;保留最近 100 个名称,它们在 `/new` 和会话切换时全部被遗忘。恢复的代理会取回这些名称,所以 `@explore` 始终指同一个对话。只在内存中存在过会话的代理没有东西可重新打开,提及它会启动一个新代理;如果会话文件此后被删除,提及会说明这一点并释放句柄,而不是悄悄把你的消息发给一个新代理。

语法镜像 Claude Code 的,并刻意收窄,以免任何东西被意外吞掉:

| 输入 | 发往 |
|-------|---------|
| `@explore fix the flaky test` | `explore` 代理 |
| `@agent-explore fix the flaky test` | 同一代理——Claude Code 的手动拼写,作为同义词接受 |
| `@main @explore is not a mention` | 主模型,剥离 `@main `——逃生舱 |
| `@explore`(无消息) | 主模型——裸句柄从不意味着发送 |
| `hey @explore look at this` | 主模型——只有**开头**的提及才被路由 |
| `@src/index.ts summarize this` | 主模型,带 pi 正常的文件附件 |
| `@nosuchagent hello` | 主模型,逐字原样——没有代理,没有类型,没有拦截 |

代理活跃时其句柄指*它*本身,所以 `@explore` 绝不会在一个 Explore 运行时再启动第二个——要刻意的并行请用 `Agent` 工具。`@<agent-id>` 也可用。`main` 是保留字,永远不能成为代理的句柄(化为此名的类型得到 `main-2`);句柄上限 64 字符。按原样写的句柄总是胜过 `@agent-` 形式,所以真叫 `agent-explore` 的代理仍然可达。[嵌套子代理](#嵌套子代理)不可寻址——它们对每个顶层界面隐藏,只有其所有者可以引导它们,因此会命名一个嵌套代理的句柄会启动一个全新的顶层代理,而不是穿透该边界。建议列表先列运行中的代理,再列可恢复的,再列可启动的类型——然后是 pi 自己的文件行,同在一个弹窗:`@` 仍是它一贯的文件选择器,句柄是加进去的而非取代它。通过 `/agents → Settings → Agent mentions` 整体禁用。

`direct` 模式启动走与调度器和跨扩展 RPC 共享的非工具生成路径,因此与它们一样,不写 `.output` 转录。这是跳过模型调用的代价:`model` 模式启动走真实的 `Agent` 工具并保留一切。实时工具活动和轮次计数*不*在这笔交易里——direct 启动与其他代理一样渲染它们。被提及*恢复*的代理走完整的恢复接线,两种模式下都保留两者。

单个代理结果在对话中按 Claude Code 风格渲染:

| 状态 | 示例 |
|-------|---------|
| **运行中** | `⠹ ↻3≤30 · 3 tool uses · 12.4k token (8%)` / `⎿ searching, reading 3 files…` |
| **已完成** | `✓ ↻8 · 5 tool uses · 33.8k token (62%) · 12.3s` / `⎿ Done` |
| **已收尾** | `✓ ↻50≤50 · 50 tool uses · 89.1k token (84% · ⇊2) · 45.2s` / `⎿ Wrapped up (turn limit)` |
| **已停止** | `■ ↻3 · 3 tool uses · 12.4k token (8%)` / `⎿ Stopped` |
| **错误** | `✗ ↻3 · 3 tool uses · 12.4k token (8%)` / `⎿ Error: timeout` |
| **已中止** | `✗ ↻55≤50 · 55 tool uses · 102.3k token (95% · ⇊3)` / `⎿ Aborted (max turns exceeded)` |

完成的结果可展开(pi 中按 ctrl+o)以内联显示完整代理输出。

默认情况下,前台和后台代理各自把完整对话流式写入每个子代理的转录——位于 `<os-tmpdir>/pi-subagents-<uid>/<cwd>/<session>/tasks/<agent-id>.output` 的 JSON 行文件(属主 `0700`,重启时清除)。对自定义代理设置 `output_transcript: false`,则不为它写转录路径或文件;或在 `subagents.json` 中设置 `outputTranscript: false`,让整个项目的转录变为可选(frontmatter 覆盖项目默认)。这只管理**转录**:它独立于 `persist_session`(磁盘上的 pi 会话),也不影响 `isolation: worktree`(把代理的工作提交到 git 分支)或 `memory:`(持久文件)——如果目标是让一次运行完全不落盘,请相应地设置那些。后台代理完成通知渲染为样式化盒子:

```
✓ Find auth files completed
  ↻3 · 3 tool uses · 12.4k token · 4.1s
  ⎿  Found 5 files related to authentication...
  transcript: /tmp/pi-subagents-501/home-user-project/sess-1/tasks/agent-abc123.output
```

分组完成时每个代理渲染为单独一块。LLM 收到结构化的 `<task-notification>` XML 供解析,用户看到的则是主题化的视觉效果。

## 默认代理类型

| 类型 | 工具 | 模型 | 提示词模式 | 描述 |
|------|-------|-------|-------------|-------------|
| `general-purpose` | 全部 7 个 | 继承 | `append`(父级孪生) | 继承父级的完整系统提示词——同样的规则、CLAUDE.md、项目约定 |
| `Explore` | read, bash, grep, find, ls | haiku(回退到继承) | `replace`(独立) | 快速代码库探索(只读) |

`general-purpose` 代理是**父级孪生**——它接收父级的完整系统提示词,外加一个子代理上下文桥接,因此遵循与父级相同的规则。Explore 使用为其只读角色定制的独立提示词。

默认代理可以被**弹出**(`/agents` → 选择代理 → Eject)导出为 `.md` 文件以便自定义;可以通过创建同名 `.md` 文件来**覆盖**(如 `.pi/agents/general-purpose.md`);或通过 `enabled: false` frontmatter **按项目禁用**。

## 自定义代理

通过创建 `.md` 文件定义自定义代理类型。frontmatter 的 `name:` 是 `subagent_type` 和分派身份,缺省回退到文件名;`display_name` 只改变 UI 标签。声明某个默认代理的名字即可覆盖它。

代理从三个位置发现(优先级高者胜):

| 优先级 | 位置 | 作用域 |
|----------|----------|-------|
| 1(最高) | `.pi/agents/<name>.md` | 项目——pi 的配置目录;权威,也是 `/agents` 写入的地方 |
| 2 | `.agents/agents/<name>.md` | 项目——跨工具共享的 `.agents` 工作区(与 `.agents/skills/` 同一约定) |
| 3 | `$PI_CODING_AGENT_DIR/agents/<name>.md`(默认 `~/.pi/agent/agents/<name>.md`) | 全局——随处可用 |

同名时项目级代理覆盖全局代理,因此你可以为特定项目定制一个全局代理。若两个项目位置定义了同名代理,**`.pi/agents/` 胜出**——`.pi` 保持项目权威;`.agents/agents/` 是为把代理资产放在 `.agents` 工作区的项目提供的附加读取位置。全局位置遵循上游 `PI_CODING_AGENT_DIR` 环境变量——设置它即可把所有 pi-coding-agent 状态(代理、技能、设置)迁移到自定义目录。代理的名字是它的 frontmatter `name:`,回退到文件名,所以现在两个文件可以声明同一个名字——后加载者胜,下方的警告会指明接管的是哪个文件。

不可读或无法解析的代理文件会被跳过而非致命——警告会指出文件和错误。如果它当时覆盖了某个同名代理,第二行会指明现在加载的是哪个文件。在 `subagents.json` 中设置 `strictAgentFiles: true`(或 `/agents → Settings → Strict agent files`),可改为在遇到损坏文件时让启动失败;会话中途的重载仍然只警告。

### 示例:`.pi/agents/auditor.md`

```markdown
---
color: red
description: Security Code Reviewer
tools: read, grep, find, bash
model: anthropic/claude-opus-4-6
thinking: high
max_turns: 30
---

You are a security auditor. Review code for vulnerabilities including:
- Injection flaws (SQL, command, XSS)
- Authentication and authorization issues
- Sensitive data exposure
- Insecure configurations

Report findings with file paths, line numbers, severity, and remediation advice.
```

然后像任何内置类型一样生成它:

```
Agent({ subagent_type: "auditor", prompt: "Review the auth module", description: "Security audit" })
```

### Frontmatter 字段

所有字段均可选——一切都有合理的默认值。

| 字段 | 默认值 | 描述 |
|-------|---------|-------------|
| `description` | 文件名 | 工具列表中显示的代理描述 |
| `name` | 文件名 | **代理的类型**——`subagent_type` 与 `@句柄` 所指向的东西。Claude Code 的规则:文件名不必匹配,所以带 `name: code-review` 的 `blubb.md` 以 `code-review` 分派。省略则使用文件名。任何值都可用,唯独含 `:` 的不行——Claude Code 把它保留给插件作用域标识符,这种文件会被跳过并警告。两个文件可以声明同名;后加载者胜,文件名冲突一贯如此 |
| `display_name` | 类型 | UI 中显示的标签(小组件、代理列表、徽章)——纯装饰,独立于 `name`。Claude Code 没有等价物;只设置 `name` 的文件以其类型作为徽章,不变 |
| `color` | — | Agent 工具头部、小组件、FleetView 和对话查看器中代理名称徽章的背景色。支持 Claude Code 的 `red`、`blue`、`green`、`yellow`、`purple`、`orange`、`pink`、`cyan`(其默认主题使用的值);带引号的六位十六进制如 `"#8B5CF6"`;以及 Agency Agents 别名(`amber`、`teal`、`indigo`、`gold`、`neon-green`、`neon-cyan`、`metallic-blue`、`violet`、`rose`、`lime`、`gray`/`grey`、`fuchsia`、`slate`、`navy`)。徽章文字为黑或白,取对渲染背景对比度能达到 4.5:1 的那个——Claude Code 对每个徽章只用一种反色。无效值不渲染徽章,各界面保留其现有主题前景色 |
| `tools` | 全部 7 个 | 代理可调用的工具。内置名(`read, grep, …`)、`*` / `all`(所有内置)、`none`,以及针对扩展工具的 `ext:<extension>` / `ext:<extension>/<tool>` 选择器。见下文[工具与扩展作用域](#工具与扩展作用域) |
| `extensions` | `true` | 为代理加载哪些扩展。`true`(全部默认)、`false`(无),或显式列表:`[mcp, "/abs/path.ts", "*"]`。见下文[工具与扩展作用域](#工具与扩展作用域) |
| `exclude_extensions` | — | 应用在 `extensions:` 之后的扩展拒绝列表——排除优先。仅限纯名称(大小写不敏感),不含路径或 `*`。与 `extensions: true` 搭配可去掉一个扩展(如 `pi-notify`) |
| `skills` | `true` | `true` 继承父级的技能;`false` 一概不继承。逗号分隔列表只把**这些**技能预加载进系统提示词,不继承其余(发现位置见[技能预加载](#技能预加载)) |
| `memory` | — | 持久化代理记忆作用域:`project`、`local` 或 `user`。自动检测只读代理 |
| `disallowed_tools` | — | 逗号分隔的工具列表,即使扩展提供也予以拒绝 |
| `isolation` | — | 设为 `worktree` 在隔离的 git worktree 中运行;或设为 `off`,即使调用方传 `isolation: "worktree"` 也拒绝(frontmatter 是权威)。`none`、`no` 和 `false` 是 `off` 的可接受写法 |
| `model` | 继承父级 | 模型——`provider/modelId` 或模糊名(`"haiku"`、`"sonnet"`)。宽容解析(`.`/`-` 与末尾日期戳可互换),若点名的 provider 没有该模型,则回退到其他 provider 下的同一模型 |
| `thinking` | 继承 | off, minimal, low, medium, high, xhigh, max——实际可用性取决于你的 pi 版本和模型;pi 会把不支持的级别下调 |
| `max_turns` | 无限 | 优雅停机前的最大代理轮次。`0` 或省略表示无限 |
| `persist_session` | `subagents.json` 的 `rememberAgents`(默认 `true`) | 将此子代理持久化为普通 pi 会话,而非仅保存在内存中;双向覆盖 `rememberAgents` 项目默认。它会记录其生成会话为父级,因此在 `/resume` 中嵌套于其下。无论哪种,子代理的 `.output` 转录仍会写出,除非 `output_transcript: false` |
| `output_transcript` | `true`(或 `subagents.json` 的 `outputTranscript`) | 写出此子代理的 `.output` 转录;设置时覆盖 `subagents.json` 的 `outputTranscript` 默认。设 `false` 则不写转录文件或路径。只管理转录——独立于 `persist_session`、`isolation: worktree` 和 `memory:` |
| `session_dir` | pi 默认 | `persist_session: true` 时可选的会话目录;省略则用 pi 正常的会话位置,相对路径从代理 cwd 解析。位于父会话目录之外的会话(此覆盖,或 `isolation: worktree`)单独列出,因此显示为根而非嵌套 |
| `allowed_subagents` | 无 | 选择加入作用域受限的嵌套 `Agent`、`get_subagent_result` 和 `steer_subagent` 工具。省略 / 空 / `none` / `false` = 无嵌套;`all`(或 `"*"` / `true`)= 任何已启用的代理;逗号分隔列表 = 仅那些代理类型 |
| `prompt_mode` | `replace` | `replace`:正文即完整系统提示词(不继承 AGENTS.md / CLAUDE.md)。`append`:正文附加到父级提示词之后(代理表现为"父级孪生"——继承父级的 AGENTS.md / CLAUDE.md) |
| `inherit_context` | `false` | 将父对话 fork 进代理 |
| `run_in_background` | — | 把此代理钉死为后台(`true`)或前台(`false`)。省略则遵循 `backgroundByDefault` |
| `isolated` | `false` | 密封专家模式:强制 `extensions: false` + `skills: false` 并丢弃 `ext:` 选择器。只有内置工具。区别于 `isolation: worktree`(文件系统) |
| `enabled` | `true` | 设为 `false` 禁用代理(可用于按项目隐藏默认代理) |

frontmatter 是权威的。如果代理文件设置了 `model`、`thinking`、`max_turns`、`inherit_context`、`run_in_background`、`isolated` 或 `isolation`,这些值对该代理锁定。`Agent` 工具参数只填充代理配置未指定的字段。

**宽容的 `model:` 解析。** `model:` 钉死值会与 pi 的模型注册表宽容匹配,以免外观性的 id 差异悄悄把代理降回父级模型:版本号中 `.` 和 `-` 视为等价(`claude-haiku-4.5` ≡ `claude-haiku-4-5`),末尾 `-YYYYMMDD` 日期戳可选(`anthropic/claude-haiku-4-5-20251001` 匹配不带日期的注册表 id,反之亦然),且点名 provider 不携带该模型的 `provider/modelId` 会拿裸 id 对每个 provider 重试。优先级为**精确 → 指定 provider 下模糊 → 任意 provider 下同一模型 → 不可用**,所以精确匹配总是获胜,带日期的快照不会被混淆。若什么都没解析到,该钉死值无法运行,代理继承父级模型——`/agents → Agent types` 会把这种情况标记为 `(unavailable, fallback: inherit)`,并在解析落在与配置不同的 provider 或版本上时显示解析目标 `(→ provider/id)`。(这区别于[模型范围](#模型范围)强制,后者按*精确*条目匹配 `enabledModels` 允许列表。)

### 嵌套子代理

嵌套委派默认关闭。只在拥有真实扇出职责的非隔离自定义代理上设置 `allowed_subagents`:

```yaml
---
tools: read, grep, find
extensions: false
allowed_subagents: support-file-finder, support-callsite-tracer   # or `all`
---
```

**允许列表是一道权限边界,不只是路由提示。** 子代理以*自己的* `tools:`、`extensions:` 和 `isolated:` 运行——父级的限制不被继承——所以委派授予父级的是所列代理能做之事的并集。上面那个只读代理可以通过任何能写、能运行命令的所列代理去写和运行命令,而 `all` 可达每个已启用代理,包括 `general-purpose`。像选择 `tools:` 本身一样慎重选择这份列表;这正是它默认关闭的主要原因。

`allowed_subagents` 是运行时强制执行的。逗号分隔列表把嵌套限制在这些类型;`all`(或 `"*"` / `true`,与 `extensions:` 和 `skills:` 接受布尔值的方式一致)允许任何已启用代理;省略、空、`none` 或 `false` 意味着完全不注入嵌套工具。未知、已禁用和不在列表中的类型会被拒绝而非回退——无视项目的[回退代理](#持久化设置)设置,因此配置的回退永远无法把允许列表之外的代理交给嵌套调用者;嵌套 `model:` 也像顶层生成一样按[模型范围](#模型范围)校验。结果、恢复和引导操作按所有权限定作用域,父级只能控制自己的子代理。嵌套记录保持在该父级内部,不出现在顶层工具、生命周期事件或代理 UI 中——因此父级结束、被停止或结束一个恢复的轮次时,其嵌套子代理随之停止。它们确实会写自己的 `.output` 转录(受同样的 `output_transcript` 门控),与祖先的转录一起归档在根会话目录下,因此嵌套运行仍可在事后检查。它们的 token 用量折叠进直到顶层代理的每个祖先的总量(生命周期事件、完成通知、`/agents`),因此嵌套消耗在任何深度都可归属,即使子代理本身保持隐藏。以 `stopped`、`aborted` 或 `steered` 结束的嵌套结果会标记为 partial,与顶层结果携带的保证相同。

硬上限默认深度 2:主会话(0)→ 子代理(1)→ 嵌套子代理(2)。用 `subagents.json` 中的 `maxSubagentDepth`(或 `/agents → Settings → Nested depth`)项目级修改;`0` 或 `1` 在所有地方关闭嵌套。已到上限的代理完全不获得嵌套工具——连 `get_subagent_result` 也没有,因为它永远不可能拥有子代理。子代理必须独立设置 `allowed_subagents` 才能再次委派;隔离的代理从不接收嵌套工具。

嵌套子代理不占用任何一个池的并发槽——它的父级已经持有一个,把它排在父级后面会让等待自己子代理的父级死锁。深度上限约束嵌套的*深*,不是*宽*:父级对并发子代理的唯一限制是每次生成要花它一轮。想给某个代理的扇出设硬顶,就在该代理上把 `allowed_subagents` 与 `max_turns` 搭配。

因为子代理会话从不激活本扩展(这正是阻止子代理再造一个代理管理器的原因,也是嵌套工具被直接注入的原因),子代理同样得不到本扩展的其他界面:没有 `/agents` 命令,没有跨扩展 RPC 处理器,没有 `subagents:ready` 事件。

### 工具与扩展作用域

`extensions:` 决定**加载哪些扩展**,`tools:` 决定**哪些工具呈现给 LLM**。两者组合:

```yaml
# 默认(两者都省略):所有扩展加载,全部 7 个内置工具呈现

tools: read, grep, find           # 收窄到所列内置工具;扩展仍然加载
tools: "*"                        # 全部 7 个内置工具(别名:`all`)
tools: none                       # 零个内置工具(别名:`""`)
tools: "*, ext:mcp/search"        # 内置工具外加一个扩展工具

extensions: false                 # 不加载任何扩展
extensions: [mcp]                 # 只加载 mcp
extensions: ["*", "/abs/foo.ts"]  # 全部默认项外加一个以路径加载的扩展

exclude_extensions: pi-notify     # 除 pi-notify 外的一切(配合 extensions: true)

# 专家:加载一个扩展,只暴露其一个工具,保留内置工具
extensions: [mcp]
tools: "*, ext:mcp/search"

isolated: true                    # 密封:仅内置工具,无扩展/技能/上下文
```

几条示例没能显而易见表达出的规则:

- `extensions:` 是唯一的加载权威。`tools:` 里的 `ext:foo` 收窄呈现范围;它自己加载不了 `foo`。不匹配会触发 `extension-error:…` 警告。
- 任何 `ext:` 条目都会把扩展工具翻转为显式允许列表——未点名的扩展仍然加载(处理器触发)但不暴露工具。所以 `tools: "*, ext:mcp/search"` 只暴露 `mcp` 的 `search`,其他扩展一概不暴露。
- 扩展名匹配大小写不敏感(`[Mcp]` = `[mcp]`);`ext:foo/bar` 中的工具名保持大小写敏感。
- **懒注册**工具的扩展也能工作。以 MCP 为后端的扩展通常要等服务器连上才能枚举工具,所以它们从 `session_start` 或 `before_agent_start` 注册,而非加载时。子代理作用域随工具出现重新推导,所以这些正常呈现——包括在 `ext:` 选择器下,无论工具何时出现,收窄都保持正确。
- 绑定进子代理的扩展会看到该会话生命周期的**两端**:代理启动时的 `session_start`,会话被处置时的 `session_shutdown`(原因 `quit`)——无论是退出,还是其记录在完成后约 10 分钟被逐出。在那时释放每会话资源;留在武装状态的东西会比它所属的会话活得更久。quit 时处理器有三秒时间,之后无论完成与否都会继续拆除。
- 已安装的**包**扩展按其包短名匹配(`@scope/pi-subagents` → `[pi-subagents]`),此外还有路径派生名(入口为 `src/index.ts` 的包也响应 `[src]`)。优先用包名——路径派生名是偶然的。
- 纯 `tools:` 拼写错误会大声失败:`tools: reed, grep` 触发 `tools-error:…`,而不是悄悄产出一个工具残缺的代理。
- `exclude_extensions:` 胜过 `extensions:` 和 `ext:` 选择器——被排除的扩展绝不加载,`tools: ext:` 条目也无法把它拉回来。仅限纯名称(不含路径、不含 `*`);匹配不到任何东西的名称触发 `extension-error:…` 警告。
- `exclude_extensions:` **不是沙箱**:被排除扩展的工厂代码在加载时仍会执行一次。排除抑制它们的工具和绑定的生命周期钩子(`pi.on` 处理器如 `session_start` 只对绑定到会话的扩展触发),但不抑制其他加载期副作用——直接订阅共享 `pi.events` 总线的工厂仍然活跃。别指望它圈住一个不受信任的扩展。
- 数组与字符串形式等价:`[a, b]` == `"a, b"`。

**代理的作用域如何对外声明。** Agent 工具描述列出每个可用代理并带 `(Tools: …)` 后缀,编排者就是读这个后缀来决定把工作路由到哪里。它描述的**只是内置作用域**——扩展工具在代理运行时才解析(扩展可能懒注册,见上),所以构建描述时无法枚举它们:

| `tools:` | 后缀 |
|---|---|
| 省略、`*` 或 `all` | `*` |
| 内置工具列表 | 该列表,如 `read, grep` |
| `none` 且 `isolated: true` 或 `extensions: false` | `none` |
| `none` 或仅 `ext:` 条目,且扩展在加载 | `no built-ins, extension tools only` |

后两行分开列出,是因为零内置不等于零工具:伴随 `extensions:` 的 `tools: none` 仍会呈现每个扩展工具,称其为 `none` 会低估代理能做什么。注意 `*` 同样不枚举扩展工具——带 `tools: "*, ext:mcp/search"` 的代理对外声明 `*`。

## 工具

### `Agent`

启动一个子代理。

| 参数 | 类型 | 必填 | 描述 |
|-----------|------|----------|-------------|
| `prompt` | string | 是 | 代理的任务 |
| `description` | string | 是 | 3-5 词的简短摘要(显示在 UI 中) |
| `name` | string | 否 | 该代理的易记名称(`auth-audit`),可作为 `@名称` 寻址,并被 `steer_subagent`/`get_subagent_result` 接受。附加性的——类型派生的句柄仍会被分配 |
| `subagent_type` | string | 是 | 代理类型(内置或自定义) |
| `model` | string | 否 | 模型——`provider/modelId` 或模糊名(`"haiku"`、`"sonnet"`)。宽容解析(`.`/`-` 与末尾日期戳可互换),带 provider 回退 |
| `thinking` | string | 否 | 思考级别:off, minimal, low, medium, high, xhigh, max(可用性取决于 pi 版本和模型) |
| `max_turns` | number | 否 | 最大代理轮次。省略表示无限(默认) |
| `run_in_background` | boolean | 否 | 默认 `true`;`false` 阻塞并内联返回结果 |
| `resume` | string | 否 | 要恢复先前会话的代理 ID |
| `isolated` | boolean | 否 | 无扩展/MCP 工具 |
| `isolation` | `"off"` \| `"worktree"` | 否 | `worktree` 在隔离的 git worktree 中运行;`off`(默认)不隔离。`worktreeIsolation: false` 时从 schema 中完全消失 |
| `inherit_context` | boolean | 否 | 将父对话 fork 进代理 |

### `SubagentWorkflow`

运行一个编排多个子代理的确定性脚本。立即返回任务 id;运行在后台继续,完成时通知。

| 参数 | 类型 | 必填 | 描述 |
|-----------|------|----------|-------------|
| `script` | string | 否 | 工作流源码。必须以 `export const meta = { name, description }` 开头 |
| `scriptPath` | string | 否 | 脚本文件路径。优先于 `script` 和 `name` |
| `name` | string | 否 | 已保存的工作流——`.pi/workflows/`、`.agents/workflows/` 或 `<agent dir>/workflows/` 中的 `<name>.js`,携带 `export const meta` 声明 |
| `args` | any | 否 | 原样作为 `args` 全局变量传给脚本 |
| `resumeFromRunId` | string | 否 | 在本会话重放一次更早的运行——其未变的开头 `agent()` 调用返回记录的结果,而非重新生成 |
| `title` / `description` | string | 否 | 与 Claude Code 一样接受但忽略——工作流由其 `meta` 块命名 |

`script` / `scriptPath` / `name` 至少需要一个;`scriptPath` 胜过 `script`,`script` 胜过 `name`。每次调用的脚本会持久化到会话目录并返回其路径,因此迭代意味着编辑那个文件再运行,而非重发源码。已保存的工作流会报告自己的文件,同样的循环对它也适用——项目 `.pi/workflows/` 遮蔽同名的全局文件。这些目录是可能存放其他脚本的普通文件夹,因此只有携带 `export const meta = { name, description }` 声明的文件才会被列出或解析;命名其他任何东西会报告它不是工作流,而不是运行它。该检查是对源码的正则——文件中没有任何东西为它执行;即使是真正的解析,也只在空的 `node:vm` 上下文中、以 100ms 为限求值 `meta` 对象字面量。

```js
export const meta = {
  name: 'auth-audit',
  description: 'Find routes missing auth checks, then verify each finding',
  phases: [{ title: 'Scan' }, { title: 'Audit' }],
}

phase('Scan')
const listing = await agent('List every route file under src/routes/. One path per line.')
const files = listing.split('\n').map(s => s.trim()).filter(Boolean)
log('auditing ' + files.length + ' files')

phase('Audit')
return await pipeline(
  files,
  file => agent(`Audit ${file} for missing auth checks.`, { label: `audit:${file}` }),
  (found, file) => agent(`Try to REFUTE this finding about ${file}: ${found}`, { label: `verify:${file}` }),
)
```

并发上限为 `max(1, min(16, cpus - 2))`——运行自己的限制,独立于会话的 `maxConcurrent` 池,其代理不进入该池。每次运行 1000 个代理,每次 `parallel`/`pipeline` 调用 4096 个条目。

**完整指南:** [`docs/workflows.md`](https://github.com/tintinweb/pi-subagents/blob/master/docs/workflows.md) —— 模型如何为你写脚本、如何编辑和重跑、如何保存为可复用的命名工作流,以及完整的 `agent()` 选项参考、配方和故障排除。

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
| `/agents` | 交互式代理管理菜单——代理类型、运行中的代理、调度任务、工作流运行、设置 |

`/agents → Workflows`(仅在[工作流](#持久化设置)开启时显示)打开一个带边框的双栏检查器,有两层深度:

```
 audit-src
 Dynamically discover files under src/ and audit each …                    1/3 agents · 32s

 ╭ Phases ──────────┬ Discover · 1 agent ──────────────────────────────────────────────╮
 │ ❯ ✔ Discover 1/1 │ ❯ ✔ discover:src Opus 5 (1M context) · 26.4k tok             25s │
 │   2 Audit    0/2 │                                                                  │
 │   3 Verify       │                                                                  │
 │   4 Synthesize   │                                                                  │
 ╰──────────────────┴──────────────────────────────────────────────────────────────────╯
 ↑↓ select · ⏎ open · f filter · x stop · esc close · c convo
```

总览把各阶段放在左边(阶段完成前显示编号,完成后显示 `✔`/`✘`),所选阶段的代理放在右边。`⏎` 打开一个:代理移到左栏,右栏变为该代理的 **Prompt**、**Activity** 和 **Outcome**,此时 `⏎` 展开提示词,`esc` 回退一层而非关闭。`↑↓`(或 `j`/`k`)移动,`f` 循环状态过滤器并在窗格标题中指明。对话框以居中覆盖层打开,与代理行打开的对话查看器一样;边框随内容自适应,介于六行到二十二行之间,所以三个代理的运行不会是二十行空白,两百个代理的运行在窗格内滚动。过长的标题以 `…` 截断而非撑破它。会话中有多个工作流时,它会询问是哪一个,最新的在前。

运行本身有五个键,页脚只在实际能起作用时才提供:

| 键 | 作用 |
|-----|--------------|
| `x` | 停止运行。仅限活跃运行——已尘埃落定的运行没有东西可停 |
| `p` | 暂停 / 恢复。暂停会停止*启动*代理;已在运行的留它们跑完,因为在轮次中途杀掉模型工作会扔掉它已经花掉的一切。暂停的时间从运行的流逝时钟中扣除 |
| `s` | 跳过所选代理:其 `agent()` 调用返回 `null`,与终端失败完全一样,该行渲染为 skipped。代理排队或运行时提供 |
| `r` | 重试所选代理:子代理被停止,同样的调用再跑一次,脚本的 `agent()` promise 仍是等待中的那个,拿到新答案。仅限运行中的代理——调用一旦落定,其值已是脚本的了,重跑无处安放。该行随后显示 `attempt 2 · user retry` |
| `c` | 打开所选代理的**对话**——与 fleet 列表行打开的相同的实时滚动查看器,覆盖在对话框之上,对话框在下方自行隐藏,关闭后恢复。这是唯一一个展示内容而非改变运行的键,所以在两层都可用,对已完成的代理也可用;阅读子代理实际做了什么是打开检查器的最大理由。子代理有记录可打开时提供,排队中的代理和从恢复日志重放的代理除外。记录在完成后十分钟被清扫,该键会如实说明而非打开空查看器 |

对运行中的代理和被暂停挂起的代理,跳过立即生效;停在并发限制后面的代理要等到队首才执行跳过。

### CLI 标志

| 标志 | 描述 |
|------|-------------|
| `--subagents-workflow-file=<path>` | 会话启动时运行一个工作流脚本 |

使用 `=` 形式。裸 `--flag value` 写法会吞掉下一个参数,所以 `pi --subagents-workflow-file review.js "do the thing"` 会把提示词当成标志的值。与无头模式组合:`pi -p --subagents-workflow-file=review.js`。由于没有工具调用可附着,运行渲染为一个会话条目,其结果作为上下文交给模型供下一轮使用。

`/agents` 命令打开交互式菜单:

```
Running agents (2) — 1 running, 1 done     ← only shown when agents exist
Agent types (6)                             ← unified list: defaults + custom
Create new agent                            ← manual wizard or AI-generated
Settings                                    ← max concurrency (background + foreground), max turns, grace turns, join mode
```

- **Running agents** — 选择一个打开其实时对话查看器。它还在运行时,按 `Enter` 打开引导输入框,再按 `Enter` 发送改变代理方向的消息(与 `steer_subagent` 工具同一机制;`Esc` 或空提交返回),或按 `x`(再按 `x` 确认)停止/中止它——包括**后台**代理,全局 Esc 无法无歧义地指向它们(Esc 仍会停止阻塞式前台 `Agent` 调用)。被停止的代理将其部分输出报告为不完整,而非完成。`m` 循环切换转录以 Markdown 渲染的比例——见[查看器 Markdown](#持久化设置)。
- **Agent types** — 带来源指示的统一列表:`•`(项目)、`◦`(全局)、`✕`(禁用)。每行显示代理的模型,高亮代理的完整描述显示在列表下方。模型列在配置的模型无法解析时标记 `(unavailable, fallback: inherit)`(它会静默继承父级模型),在解析到与配置不同的 provider 或版本时显示 `(→ provider/id)`。选择一个代理进行管理:
  - **默认代理**(无覆盖):Eject(导出为 `.md`)、Disable
  - **默认代理**(已弹出/已覆盖):Edit、Disable、Reset to default、Delete
  - **自定义代理**:Edit、Disable、Delete
  - **已禁用代理**:Enable、Edit、Delete
- **Eject** — 把内嵌的默认配置写成 `.md` 文件到项目或个人位置,以便自定义
- **Disable/Enable** — 切换代理可用性。禁用的代理在列表中保持可见(标记 `✕`),可以重新启用
- **Create new agent** — 选择项目/个人位置,然后手动向导(逐步提示名称、工具、模型、思考、系统提示词)或 AI 生成(描述代理应做什么,由一个子代理写出 `.md` 文件)。任何名称都允许,包括默认代理名(即覆盖它们)
- **Settings** — 运行时配置最大并发(后台和前台)、默认最大轮次、宽限轮次和汇聚模式

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

有两个独立的池。

**后台**(`maxConcurrent`,默认 10)。多余的代理自动排队,等运行中的代理完成后启动。小组件把排队的代理显示为折叠计数。由于代理默认后台运行,几乎每次生成都占一个槽;上限从 4 提高,以免普通的并行扇出排队。

**前台**(`maxConcurrentForeground`,默认 `0` = 无限)。默认关闭,不设置就没有任何变化。pi 通过 `Promise.all` 分派一条消息的工具调用,所以一条消息里多个 `run_in_background: false` 的 `Agent` 调用向来是同时启动的——这个设置就是给它设界。主要对本地模型有用,本地模型上并行代理会互相践踏提示词缓存([#253](https://github.com/tintinweb/pi-subagents/issues/253))。排队的前台代理在 `/agents → Running agents` 中显示为 `queued`,可在那里停止;其 `Agent` 调用在等待时如实说明,之后正常返回结果。

两者刻意**不是**一个限制。前台代理反正会阻塞父级——父级本可以自己做那份工作而不必花一个槽——所以把它记到后台池账上,会让饱和的池饿死主会话。

前台池不覆盖 `resume`:前台恢复重新打开现有会话,根本不走生成路径,所以一条消息里的多个阻塞式恢复仍可同时运行。*后台*恢复要占一个后台槽,像其他后台代理一样排队。

嵌套子代理和[工作流](#subagentworkflow)的代理完全在池外。嵌套子代理会死锁在等待它的父级后面;工作流已经把自己的扇出限制在 `max(1, min(16, cpus - 2))`,把它的代理再数一遍,会让一次运行占满会话池、饿死其他一切。

## 汇聚策略

后台代理完成时通知主代理。**汇聚模式**控制这些通知的送达方式。只适用于后台代理。

| 模式 | 行为 |
|------|----------|
| `smart`(默认) | 同一轮生成的 2 个以上后台代理自动合并为一条通知。单独的代理逐个通知。 |
| `async` | 每个代理完成时发送自己的通知(原始行为)。结果需要增量处理时最佳。 |
| `group` | 即使只生成单个代理也强制分组。当你知道还会有更多代理时有用。 |

**超时行为:**代理被分组后,30 秒超时从第一个代理完成时开始。若所有代理未能在时限内完成,会发送带已完成结果的部分通知,其余代理继续,以更短的 15 秒重新合批窗口等待掉队者。

**配置:**
- 在 `/agents` → Settings → Join mode 配置汇聚模式

## 模型范围

**可选开启:** 默认关闭。通过 `/agents → Settings → Scope models` 启用。

开启时,每次子代理生成的有效模型都会对照 pi 自己的 `enabledModels` 列表(经 pi 的 `/scoped-models` UI 配置)校验。pi-subagents 读取该列表;它不管理它。pi 的两个设置文件都被尊重:全局 `~/.pi/agent/settings.json` 和项目本地 `<cwd>/.pi/settings.json`。**项目覆盖全局**——镜像 pi 的 `SettingsManager` 深合并,因此(手工编辑进项目设置的)更紧的每项目范围会被尊重。

**超范围处理因来源而异:**

| 模型来源 | 超范围行为 |
|---|---|
| 调用方经 `Agent({ model: "..." })` 提供 | 向编排者返回硬错误,列出允许的模型 |
| 调用方经跨扩展 RPC 提供(`subagents:rpc:spawn`,如 pi-tasks `TaskExecute`) | 向调用扩展返回硬错误,列出允许的模型 |
| 在代理 frontmatter 中钉死 | 警告 toast + 该钉死模型照常运行(frontmatter 是权威) |
| 从父级继承(两者都未设置) | 警告 toast + 父级模型照常运行 |

**设计:** `scopeModels` 是针对编排者在运行时挑选意外模型的护栏,不是针对用户级配置的硬性策略。来自 v0.5.1 的"frontmatter 是权威"保证对 `model:` 依然成立——调用方参数不能覆盖 frontmatter,frontmatter 钉死值即使超范围也运行(带可见警告)。

**嵌套生成**([嵌套子代理](#嵌套子代理))对照父级的配置根应用同一张表。硬错误情形相同;警告情形静默进行,因为子代理会话没有 UI 可弹 toast。

**模式格式:** 只认精确的 `provider/modelId` 条目(如 `anthropic/claude-haiku-4-5-20251001`)。glob 模式(`*sonnet*`)、裸模型 ID 和 `:thinking` 后缀——pi 自己支持这些——在这里被静默丢弃。pi 的 `/scoped-models` 选择器写的是精确条目,所以通过 UI 配置范围时这个限制不可见。手工编辑的 glob 产生空的允许集合(范围检查成为空操作)。

**空操作安全:** 若 pi 设置中 `enabledModels` 缺失或为空,范围检查完全跳过——没有误报,没有虚假错误。

## 持久化设置

通过 `/agents` → Settings 设置的运行时调优值(最大并发、最大前台并发、默认最大轮次、宽限轮次、嵌套深度、回退代理、默认汇聚模式、调度开/关、模型范围开/关、禁用默认代理开/关、严格代理文件开/关、代理提及开/关、输出转录开/关、工具描述 full/compact/custom、小组件 all/background/off、用量上报开/关、成本显示开/关、模型显示开/关、查看器 markdown off/assistant/all)跨 pi 重启持久化。两个文件,加载时合并:

- **全局:** `~/.pi/agent/subagents.json` —— 你机器范围的默认值。手工编辑;`/agents` 菜单从不写这里。
- **项目:** `<cwd>/.pi/subagents.json` —— 每项目覆盖。由 `/agents` → Settings 写入。

**优先级:** 在双方都有的任何字段上,项目覆盖全局。缺失字段回退到硬编码默认值(最大并发 `10`、最大前台并发 `0` = 无限、默认最大轮次无限、宽限轮次 `5`、嵌套深度 `2`、汇聚模式 `smart`、默认代理启用)。

**嵌套深度**(`maxSubagentDepth`,默认 `2`):[嵌套委派](#嵌套子代理)的硬上限,从主会话数起(主 = 0,其子代理 = 1)。`0` 或 `1` 项目级禁用嵌套,无视任何代理的 `allowed_subagents`。在子代理会话构建时读取,因此更改作用于其后启动的代理。

**回退代理**(`fallbackSubagent`,默认 `general-purpose`):当调用方提供的 `subagent_type` 无法唯一解析到一个已启用代理时使用的代理——未知、已禁用,或因两个代理仅大小写不同而有歧义。命名任何已启用的代理即可把这些调用路由到那里,或设 `none` 为**严格**、失败即关的分派:调用被拒绝,错误列出可用类型,什么也不生成。严格模式对后台和调度调用最重要,否则调用方在得知任何消息之前,一个被替换的代理已经开始执行了。也可从 `/agents → Settings → Fallback agent` 设置。布尔 `false` 被接受为 `none` 的写法,否则它会作为错误类型被丢弃,悄悄留下宽松默认。其他每个值都读作代理名,所以误写的 `off` 会在分派时大声失败,而不是在设置文件里是一个意思、在解析器里是另一个意思。回退代理本身未知或已禁用属于配置错误,会被报告而非悄悄替换。注意默认值不变,且刻意保持宽松:在 `disableDefaultAgents` 且没有你自己的 `general-purpose` 时,无法解析的类型仍会解析到一个带*全部*工具的内置配置——设 `none`(或命名你自己的代理)来堵上这一点。

**严格代理文件**(`strictAgentFiles`,默认 `false`):开启时,不可读或无法解析的[代理文件](#自定义代理)会在启动时中止扩展加载并指出文件,而非跳过并警告——这样签入的 `.pi/agents/` 就不会悄悄落到来自其他位置的同名代理上。仅限启动:每次 `Agent` 调用时运行的会话中途重载,无论设置如何都只警告,因为一次糟糕的编辑不该在无关的生成上杀死会话。也可从 `/agents → Settings → Strict agent files` 设置。

**禁用默认代理**(`disableDefaultAgents`,默认 `false`):开启时,内置代理(general-purpose、Explore)不注册——只有你项目/全局的自定义代理被展示和可生成。用户定义的代理不受影响,包括按名覆盖默认代理的那些。Agent 工具的类型列表在下一个 pi 会话更新(工具 schema 在启动时注册)。

**代理提及**(`agentMentions`,默认 `"model"`):提示符处的 [`@句柄 消息`](#agent-提及)是否寻址该子代理而非主模型——发消息、恢复或启动它——以及 `@` 是否在 pi 的文件补全旁提供代理。`"model"` 和 `"direct"` 只在[谁来启动一个未运行的代理](#启动新代理)上有别:是本对话的屏幕外克隆,经由 `<system-reminder>` 和真实的 `Agent` 调用;还是本扩展,立即且无需模型调用。发消息和恢复在两者中都是直接的。`"off"` 关闭全部三个动作加建议列表,`@` 重新只意味着"附加文件",每条 `@…` 提示逐字到达主模型。通过 `/agents → Settings → Agent mentions` 切换;实时生效。此设置过去接受的布尔值仍然被读取——`true` 读作 `"model"`,`false` 读作 `"off"`。

**默认后台**(`backgroundByDefault`,默认 `true`):一条没说明的 `Agent` 调用意味着什么。开启时——跟随 Claude Code——代理分离运行,调用立即返回其 ID,完成通知附结果预览(`get_subagent_result` 取全文)。设 `false` 恢复先前的行为:未限定的生成阻塞轮次并内联返回输出。调用上显式的 `run_in_background`,或代理文件 frontmatter 里的,双向覆盖此设置;该设置只决定"未指定"意味着什么。**仅顶层**——嵌套生成(代理生成自己的子代理)始终默认前台,因为分离的子代理在其父级落定时被停止,且没有自己的通知路径。通过 `/agents → Settings → Background by default` 切换;实时生效。

**记住代理**(`rememberAgents`,默认 `true`):子代理是否持久化其 pi 会话,这正是 [`@句柄`](#agent-提及)能在代理内存记录被逐出后重新打开其对话的原因。默认的两个可见后果:顶层子代理写会话文件,并且它们在 pi 的 `/resume` 中嵌套于生成它们的会话之下。由另一个代理生成的代理被排除——它们没有句柄,没什么能重新打开其转录。自定义代理的 `persist_session` frontmatter 逐代理、双向覆盖此设置。通过 `/agents → Settings → Remember agents` 切换;关闭时句柄随记录一起过期(完成后约十分钟),`@explore` 之后启动全新代理而非恢复——即此设置存在之前的行为。

**输出转录**(`outputTranscript`,默认 `true`):写出每个子代理 `.output` 转录的项目/全局默认。通过 `/agents → Settings → Output transcript` 切换,或在 `subagents.json` 中设 `false` 让转录项目级变为可选——当运行转录不该留在磁盘上、以免被备份或 DLP 工具拾取时有用。自定义代理的 `output_transcript` frontmatter 逐代理覆盖此设置。生成时实时生效。只管理转录,不管 `persist_session`、worktree 提交或记忆文件。

**Worktree 隔离**(`worktreeIsolation`,默认 `true`):`isolation: "worktree"` 是否可以创建 worktree。通过 `/agents → Settings → Worktree isolation` 切换,或在 `subagents.json` 中设 `false`——当副本在某个仓库上花费太多时间或磁盘时。关闭时,`Agent` 工具的 `isolation` 参数从 schema 中完全消失,描述它的那条要点也随之离开工具描述——没有东西可传,也不花上下文去描述——而且 worktree 在所有其他路径上也被拒绝(代理文件、调度任务、跨扩展 RPC)。`/agents` 的代理文件生成器也停止提供 `isolation:` frontmatter 字段,因此生成的代理无法烘焙进一个会被拒绝的请求。被请求的 worktree 降级为普通运行而非调用失败,因为拒绝正是目的;结果上刻意没有注记,这正是参数消失时说明文字必须跟着消失的原因。拒绝立即生效;参数及其说明在下一个 pi 会话出现或消失。见[关闭 worktree](#关闭-worktree)。

**向会话上报用量**(`reportUsage`,默认 `false`):子代理消耗是否计入*本*会话自己的总量。子代理运行在自己的 pi 会话中,所以默认 pi 的页脚、statusline 和 `/cost` 只计主模型的花费——一个把大部分工作委派出去的会话读起来几乎免费。开启后,每个 `Agent` / `get_subagent_result` / `steer_subagent` 结果都携带自上一个以来累计的消耗,pi 把它折叠进 `getSessionStats()`;`/cost` 把它归入 **Tools/summaries** 桶。通过 `/agents → Settings → Report usage to session` 切换;实时生效。

关于这些数字有三点值得了解。每个 token 分量都会上报,`cacheRead` 包括在内——缓存前缀在每次调用上确实被重读和重新计费,pi 对会话自己的消息也是同样计法,不报它会让子代理的行在同一个总量里与其他所有行算法不同。(扩展*自己*的 token 显示仍然不含它,那是另一个问题:在那里它会夸大对完成了多少工作的解读。)成本是 pi 自己的每消息数字,按模型列出的费率定价;pi 没有费率的模型贡献零而非估算值。上下文窗口百分比不受影响:pi 仅从助手消息推导它,因此委派型会话的上下文不会显得填得更快。后台完成的代理没有自己的工具结果可搭载,所以其消耗由你下一次调用携带——页脚在下一次调用时补上,而不是它们完成的那一刻。

**显示成本**(`showCost`,默认 `false`):子代理界面是否在 token 计数旁打印估算成本——小组件(运行中*和*已完成的行)、[FleetView](#fleetview)、对话查看器、前台结果、`get_subagent_result` 和完成通知:

```text
├─ ⠹ Explore  inspect code · ↻3 · 8.2k token · ~$0.0042 · 4.1s
✓ Explore  inspect code · ↻8 · 5 tool uses · ~$0.0181 · 12.3s
```

多个后台代理一起完成时,其通知顶部带批总量(`3 agents · 45.1k token · ~$0.042`),免得数字要手工相加。

`~` 标记这是 pi 的估算而非账单数字。**有成本可显示时才显示:** pi 没有费率数据的模型报零,而其 token 旁的 `$0.00` 会说这次运行被测量过且发现免费,而非从未被测量——所以所有界面都不打印任何东西。同理,真实成本太小无法渲染时显示 `<$0.0001`。数字最少保留到分、最多四位小数(`~$0.0042`、`~$0.05`、`~$1.24`)——全部四舍五入到分,会让相差四倍的运行打印同一个数。

独立于 `reportUsage`:这个是你读的,那个是你的会话计的。通过 `/agents → Settings → Show cost` 切换;实时生效。

**显示模型**(`showModel`,默认 `false`):小组件的运行行是否标出驱动每个代理的模型及其运行所处的思考级别:

```text
├─ ⠹ Explore  inspect code · sonnet 4.6 · thinking: high · ↻3 · 8.2k token · 4.1s
```

默认关闭,因为行里已经带了描述、轮次、工具调用、token 和流逝时间,在窄终端上它每多一个字符,描述就少一个。其他界面无论开关都显示这一对:`Agent` 工具结果在其标签旁标出模型,对话查看器的 `↳` 行写明规范的 `provider/model-id`。

两处报告的都是运行*实际*使用的——pi 解析其默认值并把级别降到模型支持的范围后,从子会话读回——而非调用所要求的。两者不同时,请求保留在有效值旁边而非被丢弃,无论 pi 降了级还是代理文件的 frontmatter 压过了它:

```text
  ↳ anthropic/claude-haiku-4-5 · thinking: low (asked max) · background
```

通过 `/agents → Settings → Show model` 切换;实时生效。

**查看器 Markdown**(`viewerMarkdown`,默认 `"assistant"`):[对话查看器](#界面)的转录有多少以 Markdown 渲染,而非原样显示。

```text
off        every line literal, as before this setting existed
assistant  assistant text rendered; tool results verbatim and dim   (default)
all        tool results rendered too
```

按范围划分而非全有全无,因为两类内容有不同的契约。助手文本*就是* Markdown——模型就那样写,而查看器是唯一显示其源码的界面。工具结果是工具产出的任意字节,对它做 Markdown 处理会改写真实输出中经常出现的东西:shell 脚本中的 `# section` 丢掉 `#`,`---` 行被吞为 setext 标题,缩进输出被重新加围栏,`| a | b |` 被重绘为制表符表格。每一种读起来都像*工具*出了错,这正是 `all` 是可选开启的原因。

有两种改写被直接抑制而非交给模式,因为它们改变*数据*而非布局:有序列表标记保持源编号(`3) 7) 9)` 保持,而不是被重编号为 `3. 4. 5.`),反斜杠转义不被规范化。

为真正输出 Markdown 的工具开 `all`,看 diff 或日志时再关掉。查看器中的 `m` 在三档之间循环并持久化选择,所以这个键和此设置是同一个值——页脚显示当前生效的是 `m raw` / `m md` / `m md+`。代码围栏用 pi 自己的 Markdown 主题做语法高亮——这也是为什么围栏代码是 `all` 下*不*被变暗的唯一部分;结果的散文仍然变暗,转录保持其层次。实时生效;也可从 `/agents → Settings → Viewer markdown` 设置。

**工作流**(`workflowsEnabled`,默认 `true`):脚本化工作流的总开关。通过 `/agents → Settings → Workflows` 切换,或在 `subagents.json` 中设置。关闭时,`SubagentWorkflow` 工具永不注册——模型不会被告知该功能存在,也无法调用它,因此不花工具 spec 上下文——`/agents → Workflows` 条目隐藏,`--subagents-workflow-file` 拒绝并指向该设置而非什么都不做。在扩展加载时读取,因此在下一个 pi 会话生效;已在途的运行不受影响。

不设置它和 `true` 不完全一样。未设置意味着*自动*:开启,除非另一个扩展已提供工作流工具,那种情况下本扩展警告并在本会话让位。一个工具 spec 里放两个编排器,比没有更糟——模型得猜调用哪个,还得为两份描述买单才能弄清楚——而被刻意安装的那个扩展才是应该存活下来的。显式设置 `workflowsEnabled` 钉死答案:`true` 无论加载了什么都保留我们的,`false` 无论怎样都关闭。

匹配针对精确的工具名 `Workflow`(Claude Code 的)和 `SubagentWorkflow`(我们的),从不是子串,所以来自某个 CI 集成的 `list_workflows` 或 `github_workflow_run` 不会悄悄把该功能搞下线。检查在 `session_start` 运行,不在更早,因为 `getAllTools` 在扩展加载期间抛错,且加载顺序意味着注册时刻的检查不可能看到尚未加载的扩展——所以工具先注册,再通过 `setActiveTools` 从活动集中撤出,它会在任何轮次运行前重建系统提示词。当另一个扩展自己拿走了 `SubagentWorkflow` 这个名字,pi 的先注册者胜规则已经丢掉了我们的,所以没有东西可撤,只有菜单和 CLI 标志下线。

**工具描述**(`toolDescriptionMode`,默认 `"full"`):LLM 看到哪个 Agent 工具描述。`"full"` 是丰富的 Claude Code 风格提示词(默认代理下约 1,400 token);`"compact"` 小约 75%——单行代理类型列表、简短使用说明——面向工具 spec token 昂贵的小型/本地模型。每个选项的细节在各模式下都留在参数描述中(参数 schema 从不可自定义)。在下一个 pi 会话生效。

`"custom"` 注册你自己的描述,来自 `<cwd>/.pi/agent-tool-description.md`(项目)或 `<agentDir>/agent-tool-description.md`(全局;项目优先)。文件在工具注册时读取一次,因此编辑同样在下一个 pi 会话生效。动态部分经占位符保持鲜活——静态代理列表在你添加自定义代理的那一刻就会过时:

```markdown
Launch an autonomous agent. Available types:
{{typeList}}

Custom agents live in .pi/agents/ or {{agentDir}}/agents/.
```

占位符:`{{typeList}}`(每个代理的完整描述)、`{{compactTypeList}}`(各取第一句)、`{{agentDir}}`、`{{isolationGuideline}}` 和 `{{scheduleGuideline}}`(对应功能开启时,各自展开为自带前导换行 + `- ` 要点——直接放在你最后一条规则行之后;[worktree 隔离](#关闭-worktree) / 调度关闭时为空)。未知占位符原样保留并向 stderr 警告;文件缺失或为空回退到 `"full"` 并警告。注意通常的信任伞:项目级文件塑造编排者的提示词,与项目代理和扩展一样。

**起点:** 复制 [`examples/agent-tool-description.md`](examples/agent-tool-description.md)——它精确再现默认的完整描述(一个 CI 测试保持同步),因此你可以从已知良好的基线裁剪,而非从零写起。

**示例——高配机器上的全局默认值:**

```bash
mkdir -p ~/.pi/agent
cat > ~/.pi/agent/subagents.json <<'EOF'
{
  "maxConcurrent": 16,
  "graceTurns": 10
}
EOF
```

现在每个项目都以并发 16、宽限 10 起步,完全不用碰菜单。单个项目仍可通过 `/agents` → Settings 覆盖。

**失败行为:** 缺文件静默;格式错误的 JSON 向 stderr 记录 `[pi-subagents] Ignoring malformed settings at …` 警告;无效/越界的字段值逐字段丢弃;写入失败把 `/agents` toast 降级为带 `(session only; failed to persist)` 的警告。

## 事件

代理生命周期事件经 `pi.events.emit()` 发出,其他扩展可据此响应:

| 事件 | 时机 | 关键字段 |
|-------|------|------------|
| `subagents:created` | `Agent` 工具后台生成,或分离式恢复——**不是**跨扩展 RPC、调度器或 `@句柄` 生成,那些首次出现在 `subagents:started` | `id`, `type`, `description`, `isBackground`(总是 `true`) |
| `subagents:started` | 代理转为运行(包括排队→运行) | `id`, `type`, `description` |
| `subagents:completed` | 代理成功完成(后台和前台) | `id`, `type`, `description`, `status`, `durationMs`, `tokens`(显示总量,`{ input, output, total }`——见下方注),`usage`(本次运行的消耗,pi 的 `Usage` 形状:含 `cacheRead` 的 token 分量,外加美元计的 `cost.total`;无消耗时缺省),`toolUses`, `result` |
| `subagents:failed` | 代理出错、被停止或中止(后台和前台) | 与 `subagents:completed` 相同的载荷——两者由同一格式器构建,所以 `error` 和 `status` 也在那一行上,只是为空 |
| `subagents:steered` | 引导消息被接受——*排队*的引导和已送达的都触发 | `id`, `message` |
| `subagents:compacted` | 代理会话成功压缩 | `id`, `type`, `description`, `reason`(`"manual"` / `"threshold"` / `"overflow"`),`tokensBefore`, `compactionCount` |
| `subagents:scheduled` | 调度生命周期变化 | `{ type: "added" \| "removed" \| "updated" \| "fired" \| "error", … }`(按类型附 job/agentId/error 字段) |
| `subagents:scheduler_ready` | 调度器绑定会话,已启用的任务武装完毕 | `sessionId`, `jobCount` |
| `subagents:ready` | RPC 处理器已注册并武装——会话启动时触发;排除 pi-subagents 的会话不发出 | `{}`(空对象) |
| `subagents:settings_loaded` | 持久化设置在扩展初始化时应用 | `settings`(全局 + 项目合并) |
| `subagents:settings_changed` | `/agents` → Settings 的修改已应用 | `settings`, `persisted`(boolean——写入失败为 `false`) |

四个代理生命周期事件——`subagents:started`、`:completed`、`:failed`、`:compacted`——只为**顶层代理**发出。嵌套子代理和工作流的子代理什么都不发;它们通过拥有它们的父级或工作流汇报。

`tokens.total` = `input + output + cacheWrite`。`cacheRead` 被排除——每轮的 `cacheRead` 是在那一次 API 调用上重读的累计缓存前缀,按消息求和会把它作为工作量的度量重复计算。用 `contextUsage.percent`(在小组件中显示为 `(NN%)`)了解当前上下文大小。

`usage` 回答另一个问题——什么被计费——因此确实包含 `cacheRead`,因为前缀在每次调用上确实被重读和重新计费。它是 pi 的 `Usage`,与 pi 放在 `ToolResultEvent` 和 `AssistantMessage` 上的形状相同,所以 `usage.cost.total` 是监听者本来就期待钱的地方,pi 往 `Usage` 加的任何东西无需此处改动即可到达。两个字段互不推导;`tokens` 是视图模型,`usage` 是数据。

## 跨扩展 RPC

其他 pi 扩展可以经由 `pi.events` 事件总线以编程方式生成和停止子代理,无需直接导入本包。

所有 RPC 应答使用标准化信封:成功为 `{ success: true, data?: T }`,失败为 `{ success: false, error: string }`。

**完整参考:** [`docs/rpc.md`](https://github.com/tintinweb/pi-subagents/blob/master/docs/rpc.md) —— 完整的生成选项面(包括被静默剥离的字段)、每一条错误字符串、完成通知竞态、`Symbol.for("pi-subagents:manager")` 注册表,以及协议版本 `2` 承诺与不承诺什么。[`tintinweb/pi-tasks`](https://github.com/tintinweb/pi-tasks) 是参考实现。

### 发现

监听 `subagents:ready` 以获知 RPC 处理器何时可用:

```typescript
pi.events.on("subagents:ready", () => {
  // RPC handlers are registered — safe to call ping/spawn/stop
});
```

`subagents:ready` 仅在 pi-subagents 真正加载**并绑定**到当前会话时触发。排除它的会话(经由某代理的 `extensions:`)既不发出 `subagents:ready` 也不应答 RPC 通道——与未安装 pi-subagents 完全一样。把"没有 `subagents:ready`"当作"此处不可用",给发现加超时,而不是无限等待。

### Ping

检查 subagents 扩展是否已加载,并获取协议版本:

```typescript
const requestId = crypto.randomUUID();
const unsub = pi.events.on(`subagents:rpc:ping:reply:${requestId}`, (reply) => {
  unsub();
  if (reply.success) console.log("Protocol version:", reply.data.version);
});
pi.events.emit("subagents:rpc:ping", { requestId });
```

### Spawn

生成一个子代理并接收其 ID:

```typescript
const requestId = crypto.randomUUID();
const unsub = pi.events.on(`subagents:rpc:spawn:reply:${requestId}`, (reply) => {
  unsub();
  if (!reply.success) {
    console.error("Spawn failed:", reply.error);
  } else {
    console.log("Agent ID:", reply.data.id);
  }
});
pi.events.emit("subagents:rpc:spawn", {
  requestId,
  type: "general-purpose",
  prompt: "Do something useful",
  options: { description: "My task", isBackground: true },
});
```

`options` 是管理器的生成选项对象,不是 `Agent` 工具的参数 schema——后台标志是 `isBackground`,工具的 snake_case `run_in_background` 被原样转发并忽略。每个 RPC 生成立即返回其 id,无论哪种方式都分离运行;`isBackground: true` 让代理占用 `maxConcurrent` 槽之一(满时在其后排队)。它不影响 `subagents:created`——RPC 生成从不发出它,你看到的首个事件是 `subagents:started`。不设置它则无视限制立即启动代理。`maxConcurrentForeground` 在这里从不适用,无论 `isBackground` 说什么:它只约束调用方内联阻塞的生成,而每个 RPC 生成都是分离的。顶层 RPC 生成运行时在小组件和 FleetView 中渲染,带与 `Agent` 工具生成相同的实时工具活动和轮次计数——只有显式 `isBackground: false` 会被小组件默认的 `background` 模式丢弃,就像前台 `Agent` 调用那样。嵌套生成对两者都保持隐藏。

`options.model` 接受 `Model` 对象(如 `ctx.model`)或 `"provider/modelId"` 字符串——字符串在 RPC 边界处对 `ctx.modelRegistry` 解析,因此跨扩展调用方可以转发可序列化的值而不丢失认证上下文。解析是模糊的,所以裸 `"sonnet"` 可能落在你从未点名的 provider 上:开启[模型范围](#模型范围)时,解析到 `enabledModels` 之外的覆盖会被拒绝,返回列出允许模型的错误信封,与调用方提供的 `Agent({ model })` 完全一样。`null` 意味着未设置——代理继承,与省略该字段相同。

`options.cwd`(指向现有目录的绝对路径——其他任何值返回错误信封;`null` 意味着未设置)让代理在与父会话不同的工作目录中运行。其工具在那里操作,提示词的环境块描述那里,但 **`.pi` 配置仍从父会话的项目加载**——目标目录的 `.pi` 扩展绝不执行,其代理/技能/设置也不被拾取。与 `isolation: "worktree"` 组合时,worktree *从*目标目录的仓库创建,代理在副本内等价的子目录中工作(monorepo 包的 cwd 保持限于该包),产生的 `pi-agent-*` 分支落在那个仓库——完成消息会指出它。会话结束时,worktree 注册在每个收到它的仓库中被修剪;只有硬崩溃才会留下陈旧条目(那时:在目标仓库执行 `git worktree prune`)。带 `memory:` 的代理继续读写父项目的记忆。

### Stop

按 ID 停止运行中的代理:

```typescript
const requestId = crypto.randomUUID();
const unsub = pi.events.on(`subagents:rpc:stop:reply:${requestId}`, (reply) => {
  unsub();
  if (!reply.success) console.error("Stop failed:", reply.error);
});
pi.events.emit("subagents:rpc:stop", { requestId, agentId: "agent-id-here" });
```

### Consume

声明某代理的结果已展示给模型,使其完成通知不再叠加送达:

```typescript
pi.events.emit("subagents:rpc:consume", { requestId: crypto.randomUUID(), agentId: "agent-id-here" });
```

这是 `get_subagent_result` 返回结果时所为的总线侧一半。在 `subagents:completed` 上等待某代理并自行报告结果的调用方应该 consume 它——否则通知落在父级已经回答之后,要花一轮去关掉。fire-and-forget 是预期用法:应答不携带可行动的内容,且该通道在 `subagents:rpc:ping` 版本握手之外,所以调用方可以无条件发送,没有处理器的旧扩展只是继续通知。consume 运行中或未知的代理会被拒绝(`success: false`)且不改变任何东西——运行中的代理没有可被读取的结果,其通知仍是调用方得知它完成的唯一信号。

应答通道按 `requestId` 限定作用域,并发请求互不干扰。

## 持久化代理记忆

代理可以跨会话拥有持久记忆。在 frontmatter 中设置 `memory` 以启用:

```yaml
---
memory: project   # project | local | user
---
```

| 作用域 | 位置 | 用途 |
|-------|----------|----------|
| `project` | `.pi/agent-memory/<name>/` | 团队共享(提交进仓库) |
| `local` | `.pi/agent-memory-local/<name>/` | 机器特定(gitignore) |
| `user` | `<agentDir>/agent-memory/<name>/`(默认 `~/.pi/agent/agent-memory/`,尊重 `PI_CODING_AGENT_DIR`) | 全局个人记忆 |

`user` 作用域以前硬编码 `~/.pi/agent-memory/`。如果某代理的旧目录存在而新位置不存在,会继续使用旧目录——已有记忆不会被孤立。

记忆使用 `MEMORY.md` 索引文件和带 frontmatter 的单独记忆文件。有写工具的代理获得完全读写访问。**只读代理**(无 `write`/`edit` 工具)自动获得只读记忆——它们可以消费其他代理写的记忆,但不能修改。这防止意外的工具提权。

判断写能力时会尊重 `disallowed_tools` 字段——带 `tools: write` + `disallowed_tools: write` 的代理正确获得只读记忆。

## Worktree 隔离

设置 `isolation: worktree` 在临时 git worktree 中运行代理:

```
Agent({ subagent_type: "refactor", prompt: "...", isolation: "worktree" })
```

代理获得仓库的完整隔离副本。worktree 目录在完成时无论如何都会移除——区别在于是否留下分支:
- **无更改:** worktree 自动清理,无分支
- **有更改:** 更改提交到新分支(`pi-agent-<id>`),结果指出该分支及其 `git merge` 命令。分支是唯一产物——worktree 路径已消失,没有东西指向它内部
- **代理提交了自己的工作:** 分支创建在代理的 HEAD,保留其提交(未提交的遗留物先提交在上面)

代理的系统提示词把 worktree 命名为隔离副本,并告知只在那里工作,即使其他指令点名主检出——否则继承的父级提示词或提到项目路径的任务提示词会把它直接引出副本。这是指令,不是沙箱:有 shell 访问权的代理仍可 `cd` 出去,所以不要只靠 `isolation` 保护主检出。

自动 preservation 提交使用 `--no-verify`,本地 pre-commit 钩子无法阻止它——提交仅在本地且永不推送,pre-push/服务端钩子仍然适用。

若 worktree 无法创建(不是 git 仓库、没有提交,或 `git worktree add` 失败),`Agent` 调用以明确错误失败,而非不加隔离地运行——`isolation: "worktree"` 是严格保证,不是提示。调用被报告为失败的工具调用,而非一个运行过并返回那条消息的子代理,这样模型不会把它当作"代理只是报告了个问题"而重试。先初始化 git 并至少提交一次,或省略 `isolation`。

worktree 是*副本*,代理看不到主检出中未提交或已暂存的更改。绝不要用它审查工作树或暂存 diff:代理会发现空的 `git diff`,并报告一切正常。

### 关闭 worktree

三个杠杆,从最窄到最宽:

- **每次调用** — 省略 `isolation`,或传 `isolation: "off"`。显式值存在是因为有些模型会填满提供的每个可选参数;当 `worktree` 是唯一合法值时,它们没有办法拒绝一个(#231、#184)。
- **每个代理** — 代理文件中 `isolation: off`。frontmatter 是权威,所以即使调用方传 `isolation: "worktree"` 也拒绝 worktree——唯一能覆盖调用方的途径。
- **每个项目** — `subagents.json` 中 `"worktreeIsolation": false`。`Agent` 工具的 `isolation` 参数从 schema 中完全消失,连同描述它的使用说明要点(因此不花模型上下文,也无法被传递),且 worktree 创建在其他所有路径上也被拒绝:代理文件、调度任务、跨扩展 RPC。`/agents` 生成器写新代理文件时也停止提供 `isolation:`。用在副本花费真实时间和磁盘的大仓库上。schema 和描述都在工具注册时构建,所以它们在下一个 pi 会话出现或消失;拒绝本身立即生效。

  schema 和说明文字刻意一起门控。留下那条要点会教模型传递一个不再声明的字段——被静默接受,然后丢弃——且由于被拒绝的 worktree 在结果上不带注记,模型完全有理由继续报告一个从未创建的 `pi-agent-*` 分支。自定义工具描述应使用 `{{isolationGuideline}}` 占位符而非硬编码该要点,理由相同。

## 技能预加载

技能可按名称预加载,并注入代理的系统提示词:

```yaml
---
skills: api-conventions, error-handling
---
```

**发现根**(按此顺序检查,首个匹配获胜):

| 作用域 | 路径 | 来源 |
|---|---|---|
| 项目 | `<cwd>/.pi/skills/` | Pi 标准 |
| 项目 | `<cwd>/.agents/skills/` | [Agent Skills 规范](https://agentskills.io/integrate-skills) |
| 用户 | `$PI_CODING_AGENT_DIR/skills/`(默认 `~/.pi/agent/skills/`) | Pi 标准 |
| 用户 | `~/.agents/skills/` | [Agent Skills 规范](https://agentskills.io/integrate-skills) |
| 用户 | `~/.pi/skills/` | 旧版(Pi 之前) |

**每个根内,名为 `foo` 的技能解析为以下第一个:**

- `<root>/foo.md` — 顶层的扁平文件
- `<root>/foo/SKILL.md` — 目录技能(顶层)
- `<root>/*/.../foo/SKILL.md` — 目录技能,递归下降找到

递归跳过点文件目录和 `node_modules`。自身包含 `SKILL.md` 的目录被视为单个技能——我们不再深入。遍历按字节序排序,保证跨文件系统确定性解析。

**安全:** 符号链接在每一层都被拒绝(根、扁平文件、技能目录、技能目录内的 `SKILL.md`)——这是对 Pi 的有意偏离,Pi 跟随符号链接。含路径穿越字符(`..`、`/`、`\`、空格、前导点、超过 128 字符)的技能名被拒绝。

## 工具拒绝列表

即使扩展提供,也从代理阻止特定工具:

```yaml
---
tools: read, bash, grep, write
disallowed_tools: write, edit
---
```

这对创建继承扩展工具、但不应有写权限的代理有用。

## 架构

```
docs/                 # 长篇指南(随 npm 发布;README 链接出去)
  workflows.md        # SubagentWorkflow:编写、编辑、保存和重跑脚本
  rpc.md              # 跨扩展集成:pi.events、subagents:rpc:*、管理器注册表
examples/
  workflows/          # 可运行示例,由 test/workflow-examples.test.ts 执行
  agent-tool-description.md
test/                 # vitest 套件;e2e/ 与 perf/ 子目录
src/
  index.ts            # 扩展入口:工具/命令注册、/agents 菜单、渲染
  types.ts            # 类型定义(AgentConfig、AgentRecord 等)

  # 代理注册表
  default-agents.ts   # 内嵌默认代理配置(general-purpose、Explore)
  custom-agents.ts    # 从 .pi/agents/、.agents/agents/ 和全局 agents 加载用户定义代理
  agent-types.ts      # 统一代理注册表(默认 + 用户)、工具名解析
  agent-file-toggle.ts # 定位/编辑代理的 .md:enabled: 切换、弹出为 frontmatter
  agent-color.ts      # Claude Code/Agency Agents 名称颜色解析与徽章渲染

  # 执行
  agent-runner.ts     # 会话创建、执行、优雅 max_turns、引导/恢复
  agent-manager.ts    # 代理生命周期、并发队列、完成通知
  nested-tools.ts     # 交给子代理的委派工具(嵌套生成/收集/引导)
  child-context.ts    # AsyncLocalStorage 标志,标记为子会话完成的工作
  abortable.ts        # 把等待与 Esc 竞速,而不取消后台子代理
  group-join.ts       # 分组汇聚管理器:带超时的批量完成通知
  status-note.ts      # 非正常结果的诚实状态注记 + 抢救的部分输出
  usage.ts            # token 用量形状、累加器、会话统计读取器

  # 调用面
  invocation-config.ts # 共享工具参数 schema(isolation、join、thinking 等)
  model-resolver.ts   # 模型解析:精确 provider/modelId,带模糊回退
  enabled-models.ts   # 读取 pi 的 enabledModels 设置(项目覆盖全局)
  model-scope.ts      # scopeModels 允许列表策略,顶层与嵌套工具共享
  mention.ts          # `@句柄 消息` 语法:建议触发与发送解析
  mention-clone.ts    # 在克隆对话中运行提及的轮次,脱离主聊天
  cross-extension-rpc.ts # 经 pi.events 的跨扩展 spawn/ping RPC 处理器

  # 调度
  schedule.ts         # SubagentScheduler:cron / +10m / 间隔 / ISO 分派
  schedule-store.ts   # PID 锁、会话级、原子的调度持久化

  # 上下文与环境
  memory.ts           # 持久化代理记忆(解析、读取、构建提示词块)
  skill-loader.ts     # 预加载技能(Pi 标准 + Agent Skills 规范布局)
  output-file.ts      # 代理会话的流式输出文件转录
  worktree.ts         # Git worktree 隔离(创建、清理、修剪)
  prompts.ts          # 配置驱动的系统提示词构建器
  context.ts          # inherit_context 的父对话上下文
  settings.ts         # 持久化设置(~/.pi/agent/subagents.json + .pi/subagents.json)
  env.ts              # 环境检测(git、平台)

  workflow/
    meta.ts           # 提取并校验脚本的纯字面量 `meta` 块
    worker-source.ts  # 沙箱:vm 上下文、确定性前奏、脚本全局变量
    runtime.ts        # worker 生命周期、RPC 桥、信号量、上限、gate/resume
    progress.ts       # 进度事件日志及其所有派生视图(纯函数)
    host.ts           # AgentManager 之上的 WorkflowHost 适配器
    task.ts           # local_workflow 任务记录与批量进度更新
    tool-description.ts # 面向模型的、携带编排模式的描述
  ui/
    agent-widget.ts       # 常驻小组件:spinner、活动、状态图标、主题
    fleet-list.ts         # FleetView:编辑器下方可导航的代理列表
    conversation-viewer.ts # 查看代理会话的实时对话覆盖层
    viewer-keys.ts        # 经用户键位解析的查看器滚动键
    agent-mention.ts      # `@` 名册(运行中、可恢复、可启动的代理)+ 弹窗行
    schedule-menu.ts      # /agents → Scheduled jobs 子菜单
    select-item.ts        # 防冲突的 ctx.ui.select 包装(编号行)
    workflow-card.ts      # 内联工作流卡片(工具结果与会话条目)
    workflow-dialog.ts    # /agents → Workflows 双栏检查器
```

## 许可证

MIT — [tintinweb](https://github.com/tintinweb)
