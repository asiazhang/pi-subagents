# 0001 — 个人 fork 的功能面收窄

日期：2026-02-14
状态：已接受

## 背景

本仓库是 `@tintinweb/pi-subagents` 的个人维护副本。上游功能面约 20.9k 行（src/），覆盖工作流引擎、调度、跨扩展 RPC、Agent 提及、worktree 隔离、持久化记忆等十余个可选功能轴。对个人使用而言，大部分功能无人使用，但每一项都要支付阅读、测试与上游同步的成本。经逐组盘点（对照实际配置与已装扩展），决定收窄到一个最小可用面。

## 决策

**保留**：核心闭环（`Agent` / `get_subagent_result` / `steer_subagent`、并发队列、后台运行 + 完成通知、resume、优雅轮次上限）、代理类型（默认 + 自定义 .md）、嵌套子代理（`allowed_subagents`，为 Matt Pocock 技能集的未来编排需求预留）、scopeModels 模型范围强制、汇聚策略（group-join，smart 默认）、widget 与对话查看器。

**删除**：工作流引擎（`SubagentWorkflow` 及全部工作流 UI/CLI）、跨扩展 RPC 与生命周期事件、调度、Agent 提及（含克隆启动与 `name`/`@句柄` 寻址）、worktree 隔离、持久化记忆、技能预加载、模糊模型解析（只留精确解析）、FleetView、显示项开关（reportUsage/showCost/showModel、viewerMarkdown 持久化）、工具描述 compact/custom 模式、全局设置层（只留项目级 `subagents.json`）。

删除模糊解析的代价：代理文件钉死的模型必须是注册表精确 id；`auditor.md` 随本次修改改为精确 id。

## 理由

- 已装扩展（pi-web-access、pi-fff、pi-hashline-edit-pro、otty-integration）无一消费 `subagents:*` 事件或 RPC；未装 pi-tasks。
- 无代理使用 `memory:`、`skills:`、`allowed_subagents`（嵌套保留是前瞻）、worktree、调度、提及。
- 显示项与工具描述模式全部使用默认值——硬编码默认值即可。
- 模糊解析会掩盖"钉死的模型实际解析到了别处"的问题；scopeModels 按精确条目匹配，删除模糊解析使两者语义一致。

## 后果

- 预估 src/ 从 ~20.9k 行降到 ~7k 行；被删功能的测试一并删除。
- 与上游的 diff 变大，后续同步上游只能按补丁手工搬运，不再可能整体合并。
- 将来若需要某被删功能，从 git 历史找回该组提交比重新实现便宜——各组之间接近零耦合是上游原有设计。
