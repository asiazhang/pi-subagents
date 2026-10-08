# @tintinweb/pi-subagents

一个 [pi](https://pi.dev) 扩展,为 pi 带来 **Claude Code 风格的自主子代理**。生成运行在隔离会话中的专用代理——每个代理拥有自己的工具、系统提示词、模型和思考级别。默认在后台运行(也可阻塞等待),可在运行中途引导(steer),可恢复已完成的会话,还能定义自定义代理类型。

> 本仓库是上游 `@tintinweb/pi-subagents` 的个人精简 fork:面向单机 TUI 使用,删除了工作流引擎、调度、跨扩展 RPC、Agent 提及、worktree 隔离、持久化记忆与技能预加载。见 [docs/adr/0001-personal-fork-scope.md](docs/adr/0001-personal-fork-scope.md)。

<img width="600" alt="pi-subagents screenshot" src="https://github.com/tintinweb/pi-subagents/raw/master/media/screenshot.png" />


https://github.com/user-attachments/assets/8685261b-9338-4fea-8dfe-1c590d5df543

<img width="600" alt="pi-color-badges-white" src="https://github.com/user-attachments/assets/555dcae4-333e-4ff0-b420-7b3369c018a4" />


## 功能特性

- **Claude Code 观感** — 相同的工具名称、调用约定和 UI 模式(`Agent`、`get_subagent_result`、`steer_subagent`)——感觉浑然一体
- **并行后台代理** — 生成多个并发运行的代理,带自动排队(并发上限可配置,默认 10)与智能分组汇聚(合并通知)
- **实时小组件 UI** — 编辑器上方的常驻小组件,带动画 spinner、实时工具活动、token 计数和彩色状态图标。通过 `/agents → Settings → Widget` 配置:`all`(所有代理)、`background`(默认——隐藏前台运行,前台运行本就以 `Agent` 工具结果的形式内联渲染),或 `off`
- **对话查看器** — 在 `/agents` 中选中任意代理,打开其实时滚动的完整对话覆盖层(自动跟随新内容,向上滚动即暂停)。对运行中的代理,按 `Enter` 打开输入框,输入后按 `Enter` 发送即可内联引导(`Esc` 或空提交则返回)——消息以用户消息的形式出现,并在代理当前工具执行完后改变其工作方向。按 `x`(再按一次 `x` 确认)可停止仍在运行的代理——对后台代理同样有效。助手文本以 Markdown 渲染;`m` 可在会话内于关闭、仅助手文本与全部之间切换
- **自定义代理类型** — 在 `.pi/agents/<name>.md`、`.agents/agents/<name>.md`(项目级)或全局位置定义代理,支持 YAML frontmatter:自定义系统提示词、模型选择、思考级别、工具限制,以及与 Claude Code 兼容的彩色名称徽章
- **嵌套子代理** — 可选、默认关闭的委派机制:设置 `allowed_subagents` 的自定义代理会获得自己的、按所有权限定作用域的 `Agent`、`get_subagent_result` 和 `steer_subagent` 工具,从主会话起算深度上限(默认 2)。它只能控制自己的子代理,子代理随它结束而停止,其转录与 token 消耗向上汇总到它。允许列表是一道权限边界——子代理以自己的工具运行,所以要像选择 `tools:` 一样慎重
- **运行中引导** — 向运行中的代理注入消息以改变其工作方向,无需重启
- **会话恢复** — 从代理上次停下的地方继续,保留完整对话上下文。默认以分离方式恢复并在完成时通知你,与全新生成一样;传 `run_in_background: false` 可阻塞并内联获得结果
- **优雅轮次上限** — 代理在硬中止前会收到"收尾"警告,产出干净的局部结果而非被截断的输出
- **大小写不敏感的代理类型** — `"explore"`、`"Explore"`、`"EXPLORE"` 均可。无法唯一解析到一个*已启用*代理的类型——未知、已禁用,或仅在大小写上不同的两个代理之间有歧义——会回退到 general-purpose 并附注说明,或在 [`fallbackSubagent: none`](#持久化设置) 下直接拒绝
- **上下文继承** — 可选择将父对话 fork 进子代理,让它知道已经讨论过什么
- **工具拒绝列表** — 通过 `disallowed_tools` frontmatter 阻止特定工具
- **美化的完成通知** — 后台代理结果渲染为主题化的紧凑通知框(图标、统计、结果预览)而非原始 XML。可展开显示完整输出。分组完成时逐个渲染每个代理
- **模型范围强制** — 可选开启的校验,确保子代理的模型选择保持在你的 pi `enabledModels` 允许列表内(来源为 `/scoped-models`,同时尊重全局与项目本地 pi 设置)。调用方传入超范围模型 → 向编排者报硬错误;frontmatter 钉死的超范围模型 → 警告并照常运行(frontmatter 是权威)。通过 `/agents → Settings → Scope models` 开关

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
| `name` | 文件名 | **代理的类型**——`subagent_type` 所指向的东西。Claude Code 的规则:文件名不必匹配,所以带 `name: code-review` 的 `blubb.md` 以 `code-review` 分派。省略则使用文件名。任何值都可用,唯独含 `:` 的不行——Claude Code 把它保留给插件作用域标识符,这种文件会被跳过并警告。两个文件可以声明同名;后加载者胜,文件名冲突一贯如此 |
| `display_name` | 类型 | UI 中显示的标签(小组件、代理列表、徽章)——纯装饰,独立于 `name`。Claude Code 没有等价物;只设置 `name` 的文件以其类型作为徽章,不变 |
| `color` | — | Agent 工具头部、小组件和对话查看器中代理名称徽章的背景色。支持 Claude Code 的 `red`、`blue`、`green`、`yellow`、`purple`、`orange`、`pink`、`cyan`(其默认主题使用的值);带引号的六位十六进制如 `"#8B5CF6"`;以及 Agency Agents 别名(`amber`、`teal`、`indigo`、`gold`、`neon-green`、`neon-cyan`、`metallic-blue`、`violet`、`rose`、`lime`、`gray`/`grey`、`fuchsia`、`slate`、`navy`)。徽章文字为黑或白,取对渲染背景对比度能达到 4.5:1 的那个——Claude Code 对每个徽章只用一种反色。无效值不渲染徽章,各界面保留其现有主题前景色 |
| `tools` | 全部 7 个 | 代理可调用的工具。内置名(`read, grep, …`)、`*` / `all`(所有内置)、`none`,以及针对扩展工具的 `ext:<extension>` / `ext:<extension>/<tool>` 选择器。见下文[工具与扩展作用域](#工具与扩展作用域) |
| `extensions` | `true` | 为代理加载哪些扩展。`true`(全部默认)、`false`(无),或显式列表:`[mcp, "/abs/path.ts", "*"]`。见下文[工具与扩展作用域](#工具与扩展作用域) |
| `exclude_extensions` | — | 应用在 `extensions:` 之后的扩展拒绝列表——排除优先。仅限纯名称(大小写不敏感),不含路径或 `*`。与 `extensions: true` 搭配可去掉一个扩展(如 `pi-notify`) |
| `disallowed_tools` | — | 逗号分隔的工具列表,即使扩展提供也予以拒绝 |
| `model` | 继承父级 | 模型——精确的 `provider/modelId`,且必须在 pi 的可用模型中;解析不到则回退继承父级模型 |
| `thinking` | 继承 | off, minimal, low, medium, high, xhigh, max——实际可用性取决于你的 pi 版本和模型;pi 会把不支持的级别下调 |
| `max_turns` | 无限 | 优雅停机前的最大代理轮次。`0` 或省略表示无限 |
| `persist_session` | `subagents.json` 的 `rememberAgents`(默认 `true`) | 将此子代理持久化为普通 pi 会话,而非仅保存在内存中;双向覆盖 `rememberAgents` 项目默认。它会记录其生成会话为父级,因此在 `/resume` 中嵌套于其下。无论哪种,子代理的 `.output` 转录仍会写出,除非 `output_transcript: false` |
| `output_transcript` | `true`(或 `subagents.json` 的 `outputTranscript`) | 写出此子代理的 `.output` 转录;设置时覆盖 `subagents.json` 的 `outputTranscript` 默认。设 `false` 则不写转录文件或路径。只管理转录——独立于 `persist_session` |
| `session_dir` | pi 默认 | `persist_session: true` 时可选的会话目录;省略则用 pi 正常的会话位置,相对路径从代理 cwd 解析。位于父会话目录之外的会话单独列出,因此显示为根而非嵌套 |
| `allowed_subagents` | 无 | 选择加入作用域受限的嵌套 `Agent`、`get_subagent_result` 和 `steer_subagent` 工具。省略 / 空 / `none` / `false` = 无嵌套;`all`(或 `"*"` / `true`)= 任何已启用的代理;逗号分隔列表 = 仅那些代理类型 |
| `prompt_mode` | `replace` | `replace`:正文即完整系统提示词(不继承 AGENTS.md / CLAUDE.md)。`append`:正文附加到父级提示词之后(代理表现为"父级孪生"——继承父级的 AGENTS.md / CLAUDE.md) |
| `inherit_context` | `false` | 将父对话 fork 进代理 |
| `run_in_background` | — | 把此代理钉死为后台(`true`)或前台(`false`)。省略则遵循 `backgroundByDefault` |
| `isolated` | `false` | 密封专家模式:强制 `extensions: false` 并丢弃 `ext:` 选择器。只有内置工具 |
| `enabled` | `true` | 设为 `false` 禁用代理(可用于按项目隐藏默认代理) |

frontmatter 是权威的。如果代理文件设置了 `model`、`thinking`、`max_turns`、`inherit_context`、`run_in_background` 或 `isolated`,这些值对该代理锁定。`Agent` 工具参数只填充代理配置未指定的字段。

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

`allowed_subagents` 是运行时强制执行的。逗号分隔列表把嵌套限制在这些类型;`all`(或 `"*"` / `true`,与 `extensions:` 接受布尔值的方式一致)允许任何已启用代理;省略、空、`none` 或 `false` 意味着完全不注入嵌套工具。未知、已禁用和不在列表中的类型会被拒绝而非回退——无视项目的[回退代理](#持久化设置)设置,因此配置的回退永远无法把允许列表之外的代理交给嵌套调用者;嵌套 `model:` 也像顶层生成一样按[模型范围](#模型范围)校验。结果、恢复和引导操作按所有权限定作用域,父级只能控制自己的子代理。嵌套记录保持在该父级内部,不出现在顶层工具或代理 UI 中——因此父级结束、被停止或结束一个恢复的轮次时,其嵌套子代理随之停止。它们确实会写自己的 `.output` 转录(受同样的 `output_transcript` 门控),与祖先的转录一起归档在根会话目录下,因此嵌套运行仍可在事后检查。它们的 token 用量折叠进直到顶层代理的每个祖先的总量(完成通知、`/agents`),因此嵌套消耗在任何深度都可归属,即使子代理本身保持隐藏。以 `stopped`、`aborted` 或 `steered` 结束的嵌套结果会标记为 partial,与顶层结果携带的保证相同。

硬上限默认深度 2:主会话(0)→ 子代理(1)→ 嵌套子代理(2)。用 `subagents.json` 中的 `maxSubagentDepth`(或 `/agents → Settings → Nested depth`)项目级修改;`0` 或 `1` 在所有地方关闭嵌套。已到上限的代理完全不获得嵌套工具——连 `get_subagent_result` 也没有,因为它永远不可能拥有子代理。子代理必须独立设置 `allowed_subagents` 才能再次委派;隔离的代理从不接收嵌套工具。

嵌套子代理不占用任何一个池的并发槽——它的父级已经持有一个,把它排在父级后面会让等待自己子代理的父级死锁。深度上限约束嵌套的*深*,不是*宽*:父级对并发子代理的唯一限制是每次生成要花它一轮。想给某个代理的扇出设硬顶,就在该代理上把 `allowed_subagents` 与 `max_turns` 搭配。

因为子代理会话从不激活本扩展(这正是阻止子代理再造一个代理管理器的原因,也是嵌套工具被直接注入的原因),子代理同样得不到本扩展的其他界面:没有 `/agents` 命令。

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

isolated: true                    # 密封:仅内置工具,无扩展工具
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
| `subagent_type` | string | 是 | 代理类型(内置或自定义) |
| `model` | string | 否 | 模型——精确的 `provider/modelId` |
| `thinking` | string | 否 | 思考级别:off, minimal, low, medium, high, xhigh, max(可用性取决于 pi 版本和模型) |
| `max_turns` | number | 否 | 最大代理轮次。省略表示无限(默认) |
| `run_in_background` | boolean | 否 | 默认 `true`;`false` 阻塞并内联返回结果 |
| `resume` | string | 否 | 要恢复先前会话的代理 ID |
| `isolated` | boolean | 否 | 无扩展/MCP 工具 |
| `inherit_context` | boolean | 否 | 将父对话 fork 进代理 |

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
| `/agents` | 交互式代理管理菜单——代理类型、运行中的代理、设置 |

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

嵌套子代理完全在池外——它的父级已经持有一个槽,把它排在父级后面会让等待自己子代理的父级死锁。

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
| 在代理 frontmatter 中钉死 | 警告 toast + 该钉死模型照常运行(frontmatter 是权威) |
| 从父级继承(两者都未设置) | 警告 toast + 父级模型照常运行 |

**设计:** `scopeModels` 是针对编排者在运行时挑选意外模型的护栏,不是针对用户级配置的硬性策略。来自 v0.5.1 的"frontmatter 是权威"保证对 `model:` 依然成立——调用方参数不能覆盖 frontmatter,frontmatter 钉死值即使超范围也运行(带可见警告)。

**嵌套生成**([嵌套子代理](#嵌套子代理))对照父级的配置根应用同一张表。硬错误情形相同;警告情形静默进行,因为子代理会话没有 UI 可弹 toast。

**模式格式:** 只认精确的 `provider/modelId` 条目(如 `anthropic/claude-haiku-4-5-20251001`)。glob 模式(`*sonnet*`)、裸模型 ID 和 `:thinking` 后缀——pi 自己支持这些——在这里被静默丢弃。pi 的 `/scoped-models` 选择器写的是精确条目,所以通过 UI 配置范围时这个限制不可见。手工编辑的 glob 产生空的允许集合(范围检查成为空操作)。

**空操作安全:** 若 pi 设置中 `enabledModels` 缺失或为空,范围检查完全跳过——没有误报,没有虚假错误。

## 持久化设置

通过 `/agents` → Settings 设置的运行时调优值(最大并发、最大前台并发、默认最大轮次、宽限轮次、嵌套深度、回退代理、默认汇聚模式、模型范围开/关、禁用默认代理开/关、严格代理文件开/关、输出转录开/关、小组件 all/background/off、记住代理开/关)跨 pi 重启持久化。单一文件:`<cwd>/.pi/subagents.json`(本 fork 删除了全局层与显示项开关)。

**优先级:** 缺失字段回退到硬编码默认值(最大并发 `10`、最大前台并发 `0` = 无限、默认最大轮次无限、宽限轮次 `5`、嵌套深度 `2`、汇聚模式 `smart`、默认代理启用)。

**嵌套深度**(`maxSubagentDepth`,默认 `2`):[嵌套委派](#嵌套子代理)的硬上限,从主会话数起(主 = 0,其子代理 = 1)。`0` 或 `1` 项目级禁用嵌套,无视任何代理的 `allowed_subagents`。在子代理会话构建时读取,因此更改作用于其后启动的代理。

**回退代理**(`fallbackSubagent`,默认 `general-purpose`):当调用方提供的 `subagent_type` 无法唯一解析到一个已启用代理时使用的代理——未知、已禁用,或因两个代理仅大小写不同而有歧义。命名任何已启用的代理即可把这些调用路由到那里,或设 `none` 为**严格**、失败即关的分派:调用被拒绝,错误列出可用类型,什么也不生成。严格模式对后台调用最重要,否则调用方在得知任何消息之前,一个被替换的代理已经开始执行了。也可从 `/agents` → Settings → Fallback agent 设置。布尔 `false` 被接受为 `none` 的写法,否则它会作为错误类型被丢弃,悄悄留下宽松默认。其他每个值都读作代理名,所以误写的 `off` 会在分派时大声失败,而不是在设置文件里是一个意思、在解析器里是另一个意思。回退代理本身未知或已禁用属于配置错误,会被报告而非悄悄替换。注意默认值不变,且刻意保持宽松:在 `disableDefaultAgents` 且没有你自己的 `general-purpose` 时,无法解析的类型仍会解析到一个带*全部*工具的内置配置——设 `none`(或命名你自己的代理)来堵上这一点。

**严格代理文件**(`strictAgentFiles`,默认 `false`):开启时,不可读或无法解析的[代理文件](#自定义代理)会在启动时中止扩展加载并指出文件,而非跳过并警告——这样签入的 `.pi/agents/` 就不会悄悄落到来自其他位置的同名代理上。仅限启动:每次 `Agent` 调用时运行的会话中途重载,无论设置如何都只警告,因为一次糟糕的编辑不该在无关的生成上杀死会话。也可从 `/agents` → Settings → Strict agent files 设置。

**禁用默认代理**(`disableDefaultAgents`,默认 `false`):开启时,内置代理(general-purpose、Explore)不注册——只有你项目/全局的自定义代理被展示和可生成。用户定义的代理不受影响,包括按名覆盖默认代理的那些。Agent 工具的类型列表在下一个 pi 会话更新(工具 schema 在启动时注册)。

**默认后台**(`backgroundByDefault`,默认 `true`):一条没说明的 `Agent` 调用意味着什么。开启时——跟随 Claude Code——代理分离运行,调用立即返回其 ID,完成通知附结果预览(`get_subagent_result` 取全文)。设 `false` 恢复先前的行为:未限定的生成阻塞轮次并内联返回输出。调用上显式的 `run_in_background`,或代理文件 frontmatter 里的,双向覆盖此设置;该设置只决定"未指定"意味着什么。**仅顶层**——嵌套生成(代理生成自己的子代理)始终默认前台,因为分离的子代理在其父级落定时被停止,且没有自己的通知路径。通过 `/agents` → Settings → Background by default 切换;实时生效。

**记住代理**(`rememberAgents`,默认 `true`):子代理是否持久化其 pi 会话。开启时顶层子代理写会话文件,并在 pi 的 `/resume` 中嵌套于生成它们的会话之下。由另一个代理生成的代理被排除。自定义代理的 `persist_session` frontmatter 逐代理、双向覆盖此设置。通过 `/agents` → Settings → Remember agents 切换。

**输出转录**(`outputTranscript`,默认 `true`):写出每个子代理 `.output` 转录的项目默认。通过 `/agents` → Settings → Output transcript 切换,或在 `subagents.json` 中设 `false` 让转录项目级变为可选——当运行转录不该留在磁盘上时有用。自定义代理的 `output_transcript` frontmatter 逐代理覆盖此设置。只管理转录,不管 `persist_session`。

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
  adr/                # 决策记录(0001:个人 fork 的功能面收窄)
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
  invocation-config.ts # 共享工具参数 schema(join、thinking 等)
  model-resolver.ts   # 模型解析:精确 provider/modelId
  enabled-models.ts   # 读取 pi 的 enabledModels 设置(项目覆盖全局)
  model-scope.ts      # scopeModels 允许列表策略,顶层与嵌套工具共享

  # 上下文与环境
  output-file.ts      # 代理会话的流式输出文件转录
  prompts.ts          # 配置驱动的系统提示词构建器
  context.ts          # inherit_context 的父对话上下文
  settings.ts         # 持久化设置(<cwd>/.pi/subagents.json)
  env.ts              # 环境检测(git、平台)

  ui/
    agent-widget.ts       # 常驻小组件:spinner、活动、状态图标、主题
    conversation-viewer.ts # 查看代理会话的实时对话覆盖层
    viewer-keys.ts        # 经用户键位解析的查看器滚动键
    select-item.ts        # 防冲突的 ctx.ui.select 包装(编号行)
```


## 许可证

MIT — [tintinweb](https://github.com/tintinweb)
