ALTER TABLE review_results ADD COLUMN manual_decision TEXT CHECK(manual_decision IS NULL OR manual_decision IN('MATCH','NO_MATCH'));

-- 旧版本只记录人工通过/排除，没有保存人工最终判定。按当时的操作意图补齐：
-- 通过即人工认定符合，排除即人工认定不符合；模型原始 decision 保持不变。
UPDATE review_results SET manual_decision='MATCH' WHERE review_status='APPROVED';
UPDATE review_results SET manual_decision='NO_MATCH' WHERE review_status='REJECTED';
