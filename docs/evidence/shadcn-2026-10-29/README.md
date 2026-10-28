# 轻序 shadcn 控件迁移

官方 @shadcn registry，npm CLI 4.23.0；沿用现有 radix/new-york、Tailwind v4、mist tokens 和本地 Button。没有更换 preset、覆盖已有组件或增加依赖。完整类型检查、构建及 npm test 的 1,141 项测试通过。

## 覆盖

- 42 个原生 select 使用真正的 shadcn/Radix Select；显式空值通过内部编码保留，禁用项、键盘选择、长文本、浮层定位和 label 关联保留。
- Checkbox、Switch、Button、Input、Textarea、Field/FieldGroup/FieldSet/Label：覆盖工作台、采集配置、账号/设备、审核、自动回复、线索/任务/话术、登录页。登录 remember 默认关闭，认证逻辑未更改。
- ToggleGroup 用于单选筛选；Collapsible 用于详情展开；Pagination 用于现有分页操作；Card、Badge、Avatar、Empty、Alert、Skeleton/Spinner、Tooltip 统一适用展示。
- 居中 Dialog 保留已修复的退出动画与多层行为；新增 AlertDialog 替换站内放弃草稿原生确认。浏览器刷新/关页的 beforeunload 保留浏览器原生确认。
- 专用评论树、流程步骤、底部 Dock、业务统计布局保留专用结构，内部使用基础组件；不引入无实际需求的 Combobox、百分比 Progress、通知栈或侧抽屉。
- 非 ui/vendor 业务 JSX 已无原生 select/option/input/textarea/button/details/summary/fieldset/legend/table。Radix 的 aria-hidden 表单桥接 input/select 是组件内部行为，不是可见原生控件。

## Dock 根因与修复

真实 Chrome 的 15px 滚动条在 Dialog 锁定 body 后消失；主体被 Radix 的 margin-right 补偿，fixed Dock 原先仍按变宽的视口居中，x 从 710 变为 717.5。Dock 现在使用 RemoveScroll 的实际 --removed-body-scroll-bar-size，扣除根元素已保留的 gutter 后计算中心，不硬编码 15px、不关闭滚动锁。

## 隔离浏览器验证

所有业务 API 为合成数据；无平台采集、模型请求、真实发送。

- 新控件：1440/390、正常/减少动效；15px/overlay 滚动条、长/短页；业务/设置交替开关；Dock/主体/页头 x 和宽度稳定（容差 0.6px）；锁与 body 样式恢复。
- Select：键盘 End/Enter、清空、长选项、禁用项、弹窗内层级、Escape 只关下拉、焦点恢复；AlertDialog 继续编辑/放弃。
- 导航 60 组；登录 4 组；模型设置 7 组（1440/390/320）；自动回复 16 组；整帖审核 22 组；采集任务 40 组；任务启动预检 48 组；单帖读取 4 组；帖子可用性 8 组；评论树桌面/手机（26 帖/122 评论）。
- 刷新、前后退、旧路由、权限错误、遮罩四角/重复开关/双击、评论分页与上下文均有覆盖。测试修改仅适配组件真实交互及原生 details 改为懒挂载 Collapsible 的展开步骤。

真实登录后的更新验收与数据前后核对另记录于 production.md。
