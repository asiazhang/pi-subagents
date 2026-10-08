# 0002 — 第二轮功能收窄:只剩两个内嵌代理类型

日期：2026-02-14
状态：已接受(resume 部分被 0003 取代)
取代 [0001](0001-personal-fork-scope.md) 中"保留自定义代理与嵌套子代理"的部分。

## 背景

第一轮收窄（0001）保留了自定义代理文件、嵌套子代理与 scopeModels，理由分别是"在用"与"前瞻"。第二轮逐一复核后，事实变了：`.pi/agents/` 下没有任何自定义代理（唯一一个 `auditor.md` 不是本仓库的文件，已删除）；嵌套委派从未启用——原本为 Matt Pocock 技能集预留，核实其 `implement-spec` 后发现它只用扁平扇出，worktree 由子代理用 bash 自理，不需要嵌套；scopeModels 校验的模型集合只有一个人工入口，而精确解析已让钉死模型无处漂移。经逐项访谈确认，决定把 fork 收窄到两个内嵌类型。

## 决策

**删除**：整个自定义代理子系统（`.md` 代理文件、三个发现位置、全部 frontmatter 字段、`/agents` 的类型列表/创建向导/详情菜单、`display_name` 与彩色名称徽章、Eject）；嵌套子代理（`allowed_subagents`、`maxSubagentDepth`、nested-tools）；scopeModels（含 `enabled-models.ts`、`model-scope.ts`）；前台并发池（`maxConcurrentForeground`）；`fallbackSubagent` 与大小写不敏感解析；`inherit_context`；Agent 工具的 `isolated` 参数；`strictAgentFiles`/`disableDefaultAgents`（随自定义代理失去意义）；汇聚模式设置（group-join 保留但钉死 `smart`）。

**保留并明确语义**：核心闭环不变（`Agent` / `get_subagent_result` / `steer_subagent`、单后台池、resume、优雅轮次上限、会话持久化、widget、对话查看器）。两个新语义钉死：

- **严格精确分派**：`subagent_type` 必须精确匹配；未知类型报错并列出可用类型，不回退、不大小写折叠。
- **工具呈现白名单**：类型声明了内置工具列表 = 精确白名单（扩展仍加载、钩子仍活跃，仅工具不呈现）；省略列表 = 内置全量 + 扩展全量。

**变更**：Explore 的模型钉死改为 `opencode-go/claude-haiku-5-5`（本机 `enabledModels` 中存在）；`general-purpose` 与 Explore 保持内嵌，`Agent` 工具的 `model` 参数保留。

## 理由

- **每项保留都在付税。** 自定义代理子系统拖着文件发现、frontmatter 解析、覆盖/禁用/严格模式、彩色徽章和三分之二的 `/agents` 菜单，而唯一的代理文件还是别人的。删除后代理注册表是一张两张条目的静态 Map，类型分派是精确查找加报错——阅读、测试与上游同步的成本一并消失。
- **回退与模糊是有害的宽容。** `fallbackSubagent` 让拼错的类型静默换成一个全能代理执行；大小写折叠让 `Explore` 与 `explore` 的歧义需要一条规则来裁决。严格分派把错误推回调用方，一次报错换确定行为。
- **白名单语义对齐真实机制。** 上游"`tools:` 收窄、`ext:` 选择、`isolated` 密封"的矩阵有十几种组合，实际只用两个：全量（general-purpose）和只读五件套（Explore）。二态语义保留全部在用行为，删掉整个组合空间。
- **汇聚钉死 `smart` 是删设置而非删功能**——三种模式里只有默认的被使用；async/group 没有使用场景。

## 后果

- src/ 从约 9.2k 行降到约 5.8k 行；`Agent` 工具参数剩 8 个（失去 `isolated`、`inherit_context`）；`subagents.json` 只剩七项设置。
- 与上游（及第一轮后的 fork）的 diff 进一步扩大，上游同步只能继续按补丁手工搬运。
- 将来若真需要自定义代理，从 git 历史找回 custom-agents 一组提交比重新实现便宜；届时应连同 frontmatter 与 `/agents` 菜单一起整体恢复，而不是零碎加回。
- README 同步重写（用户文档唯一权威）；术语收口见根目录 `GLOSSARY.md`。
