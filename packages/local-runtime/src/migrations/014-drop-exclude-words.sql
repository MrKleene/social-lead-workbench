-- 关键词配置的「排除词」已从产品移除：它只被校验和保存，从未参与采集或匹配
-- （唯一使用它的 classify() 没有任何调用方）。清理存量 body，避免配置继续携带死字段，
-- 也避免旧数据里"排除词覆盖关键词"命中已被删除的校验规则。
-- 只动 KEYWORDS 的 body，不碰 revision——内容语义没变，不能影响正在编辑的乐观并发。
UPDATE configurations SET body=json_remove(body,'$.excludeWords')
 WHERE kind='KEYWORDS' AND json_type(body,'$.excludeWords') IS NOT NULL;
