# pi-subagents

pi 的子代理扩展:让主代理把独立任务交给运行在隔离会话中的自主代理,并行执行、按需收取结果。个人 fork,只保留两个内嵌代理类型与后台执行闭环。

## Language

**子代理 (Subagent)**:
在隔离的 pi 会话中为主代理执行任务的自主代理,有自己的上下文窗口,结束后向主代理报告。
_Avoid_: child agent、worker、slave agent

**编排者 (Orchestrator)**:
生成并引导子代理的主会话代理——发起 `Agent` 调用、接收完成通知、决定是否收取结果的一方。
_Avoid_: 父代理、主代理、parent

**代理类型 (Agent type)**:
`subagent_type` 参数指向的具名配置,决定代理的工具、模型与系统提示词。本扩展只有 `general-purpose` 与 `Explore` 两个,内嵌于扩展,不可由用户增删。
_Avoid_: 代理定义、custom agent、agent profile

**后台运行 (Background run)**:
分离执行:调用立即返回代理 ID,代理在池中运行,完成时以通知附结果预览送达编排者。
_Avoid_: detached、async spawn

**前台运行 (Foreground run)**:
阻塞式执行:调用等到代理完成,完整输出内联返回,不占后台池。
_Avoid_: blocking run、inline run

**汇聚 (Join)**:
同一轮生成的多个后台代理,完成通知合并为一条一次性送达;超时则先送达已完成的部分。单独生成的代理逐个通知。
_Avoid_: batch notify、group mode

**转录 (Transcript)**:
子代理一次运行的逐条消息记录,以 JSON-lines 形式写成 `.output` 文件,供事后检查。
_Avoid_: log、output file、session file

**优雅轮次上限 (Graceful turn limit)**:
到达轮次上限时不硬中止,而是先注入收尾警告并给出宽限轮次,让代理产出完整的局部结果。
_Avoid_: soft limit、turn cap

**工具白名单语义 (Tool allowlist semantics)**:
代理类型的工具呈现规则:声明了内置工具列表即精确白名单(扩展仍加载,仅工具不呈现);省略则内置工具与扩展工具全量呈现。
_Avoid_: tool scope、tool veto
