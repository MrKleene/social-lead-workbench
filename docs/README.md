# 文档索引

本项目文档只分两层：**做什么** 和 **怎么实现**。历史交付报告、验证证据、过期方案均已删除，
需要追溯时查 git 历史。

| 目录 | 回答的问题 |
| --- | --- |
| [`requirements/`](requirements/README.md) | 产品该做什么、边界在哪、现在做到哪 |
| [`design/`](design/README.md) | 各模块怎么实现的、关键约束是什么 |

## 阅读路径

**想快速了解这个产品** → [requirements/REQUIREMENTS.md](requirements/REQUIREMENTS.md)（6 个能力各一行）
→ [requirements/MODULES.md](requirements/MODULES.md)（10 个模块的职责与代码入口）

**想知道某个功能现在能不能用** → [requirements/IMPLEMENTATION-STATUS.md](requirements/IMPLEMENTATION-STATUS.md)
→ [requirements/ACCEPTANCE.md](requirements/ACCEPTANCE.md)

**想改代码** → 先看 `design/` 里对应模块的说明，再按 [工程结构](design/project-structure.md) 找到对应模块的源码与测试

## 目录之外

- `README.md`（仓库根）：产品一句话、启动方式、目录速览
- `AGENTS.md`（仓库根）：前端 UI 强制约束，`ui:check` 的实现依据
- `apps/web/DESIGN.md`：唯一样式规范（token、排版、组件、CJK 规则）

## 维护规则

1. 需求变更改 `requirements/`，实现变更改 `design/`，两边都要动时先改需求。
2. 不要把"计划"写成"已支持"；没有证据的能力标"合成验证"或"待验收"。
3. 新增文档先想清楚属于哪一层，再放进对应目录，并在该目录的 README 里登记。
4. 验证过程、部署记录、一次性排查结论不单独建文档，写进提交说明即可。
