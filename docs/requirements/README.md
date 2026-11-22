# 业务需求文档

本目录只放**当前有效**的业务需求层，回答"产品该做什么、边界在哪、现在做到哪"。
带日期的交付报告已删除，只保留在 git 历史中，不进本目录。

## 阅读顺序

1. [OVERVIEW.md](OVERVIEW.md) — 一页看全：能力矩阵、代码状态、自动化证据、真实验收
2. [REQUIREMENTS.md](REQUIREMENTS.md) — 产品范围与验收边界，6 个能力各一行
3. [MODULES.md](MODULES.md) — 逐模块职责、输入输出、关键约束、代码入口
4. [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) — 当前实现范围与验证限制
5. [ACCEPTANCE.md](ACCEPTANCE.md) — 本轮验收范围
6. 按需：[three-step-automation.md](three-step-automation.md)（采集、评论匹配、自动回复与发送队列）、
   [inbox-reception.md](inbox-reception.md)（接收消息）、
   [direct-messages.md](direct-messages.md)（私信发送与执行边界）、
   [DESKTOP-LOCAL.md](DESKTOP-LOCAL.md)（单人本地桌面版）

## 文件清单

| 文件 | 回答的问题 | 维护时机 |
| --- | --- | --- |
| `OVERVIEW.md` | 哪些能力已接入、哪些已合成验证、哪些真实未验收 | 每次实现或验收后同步 |
| `REQUIREMENTS.md` | 产品范围、验收标准、权限与数据边界 | 范围变化时 |
| `MODULES.md` | 每个模块做什么、不能做什么、代码在哪 | 模块行为变化时 |
| `IMPLEMENTATION-STATUS.md` | 现在实现了多少、哪些只是合成验证 | 每次实现/验收后 |
| `ACCEPTANCE.md` | 本轮验收包含哪些、不包含哪些 | 每轮交付 |
| `three-step-automation.md` | 采集/匹配/回复三阶段、发送队列与统一设置的行为 | 自动化流程变化时 |
| `inbox-reception.md` | 接收窗口、工具集、历史上限 | 接收能力变化时 |
| `direct-messages.md` | 私信发送、会话回复与去重边界 | 私信能力变化时 |
| `DESKTOP-LOCAL.md` | 桌面版范围、数据与凭据边界、构建状态 | 桌面版变化时 |

## 不在本目录的

- 模块技术设计：`docs/design/`（采集窗口、回复目标、私信额度、模型、进度推送、本地运行时）
- 文档总索引：[../README.md](../README.md)

## 维护规则

- 需求与实现状态**分开写**，不要把"计划"写成"已支持"。
- 新增需求先改 `REQUIREMENTS.md`，再改 `MODULES.md` 对应小节，最后在
  `IMPLEMENTATION-STATUS.md` 记录实际进度。
- 没有证据的能力标"合成验证"或"待验收"，不能只写"完成"。
- 想知道某个功能现在能不能用，先看 `OVERVIEW.md` 的能力矩阵，再按需查 `IMPLEMENTATION-STATUS.md`。
- 带日期的交付报告不作为当前依据；需要追溯旧结论时查 git 历史。
