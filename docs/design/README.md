# 机制设计

本目录描述**当前实现**的技术细节：约束、预算、协议与边界。
产品范围见 [`../requirements/`](../requirements/README.md)。

这里不放验证过程、部署记录或候选状态——那些只写在提交说明里。

| 文件 | 内容 |
| --- | --- |
| [comment-read-through.md](comment-read-through.md) | 评论读取窗口的实际预算：主评滚动 3 次、12 次回复操作、40 根 / 100 唯一 / 15 秒；预算由 `packages/domain/src/collection/comment-read-policy.cjs` 固定，请求方不能扩大 |
| [comment-reply-target.md](comment-reply-target.md) | 回复目标怎么选：直接目标取 `targetComment`，`subComments` 是讨论关系不是目标；嵌套语义仍待真实页面比对 |
| [dm-templates-and-day-limit.md](dm-templates-and-day-limit.md) | 私信模板独立分类；`AccountDay.dailyLimitOverride` 只作用于 `REAL:Asia/Shanghai:YYYY-MM-DD` 单日桶，不动永久额度与占用数 |
| [qwen-comment-matching.md](qwen-comment-matching.md) | 模型调用节奏：全局并发 1、两次开始至少间隔 1 秒、429 后退避 60 秒；脱敏、预算与证据守卫 |
| [model-settings-security.md](model-settings-security.md) | 模型密钥库：主密钥位置、加密方式、部署与恢复步骤 |
| [local-runtime.md](local-runtime.md) | `packages/local-runtime/src` 的结构：只用 Node 内置模块，不依赖 Electron / React / Prisma / PostgreSQL / Redis；测试入口 `npm run local:test` |
| [conversation-replies.md](conversation-replies.md) | 收件会话与回复的边界 |

## 写新文档时

- 只写**现在是什么**，不写"这次改了什么"。变更原因写在提交说明里。
- 数字要能对应到代码：预算写进 `packages/domain/src/collection/comment-read-policy.cjs` 之类的常量，不要只写在文档里。
- 标注失效条件：什么情况下这条规则不成立（例如"平台限制、取消、无进展时不续读"）。

## 工程结构

[project-structure.md](project-structure.md) 定义目录归属、依赖方向、构建产物和验证入口；调整工程边界时同步维护。
