-- 三张自 v1 起就没有读写方的死表：captured_posts / captured_comments 从未被采集写入
-- （真实数据在 run_posts / run_comments），inbox_messages 的内容在 002 已搬进
-- received_messages，之后无任何引用。直接物理删除，避免它们继续被误认为是业务表。
-- 子表先删，避免外键校验失败。
DROP TABLE IF EXISTS captured_comments;
DROP TABLE IF EXISTS captured_posts;
DROP TABLE IF EXISTS inbox_messages;
