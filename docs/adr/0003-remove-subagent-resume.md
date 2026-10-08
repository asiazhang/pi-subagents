# 0003 — 删除子代理 resume

日期：2026-10-08
状态：已接受
取代 [0002](0002-second-round-narrowing.md) 中"保留 resume"的部分。

## 背景

0002 保留了 resume：对已完成的子代理，以新 prompt 续接其会话。resume 依赖内存中的会话对象，而代理记录在完成后 10 分钟即被清理（会话切换时也会清空），因此可用窗口很短。

会话文件层面的恢复（`resumeSessionFile` 参数与 `AgentRecord.sessionFile`）没有生产调用方：`sessionFile` 只写不读，`resumeSessionFile` 只在测试中传入。驱逐后的 resume 实际返回"not found"。

用户确认不需要子代理的 resume 能力。

## 决策

删除子代理的 resume 能力，包括：

- `Agent` 工具的 `resume` 参数，以及前台、后台两条恢复路径。
- `AgentManager.resume` 与 `startResume`，`runAgent` 的 `resumeSessionFile`，`resumeAgent`。
- `AgentRecord.sessionFile`。
- 只为恢复存在的辅助逻辑：`ensureOutputFile`、`streamToOutputFile` 的 `startIndex` 参数、`AgentWidget.markRunning`。
- `rememberAgents` 设置及其子会话落盘逻辑。子代理会话一律在内存中运行，不再写入 pi 的会话目录。

需要继续某个子代理的工作时，新开一个子代理，并在 prompt 中写明全部背景。

## 理由

- 可用窗口已经很短（完成后 10 分钟，会话切换即失效），实际覆盖的场景有限。
- 维护成本集中在恢复路径上：重入保护、abort 控制器替换、队列中的恢复项、输出文件的追加锚点。删除后 `AgentManager` 的运行与队列逻辑少一整条分支。

## 后果

- 对同一子代理分轮追问的用法消失。追问需要重新生成子代理，之前的推理与读取结果不会保留。
- 子代理会话不再持久化，pi 的 `/resume` 列表中也不再出现子会话。
- pi 自身的 `/resume`（会话恢复）不受影响。
