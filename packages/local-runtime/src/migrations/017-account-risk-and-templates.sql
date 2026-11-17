-- 017: 账号级风控与模板轮换
-- account_holds.detail：风险记录只留轻证据（原因码、平台原话、账号、第几条、收件人、时间），
--   问题解决后由发送成功/主页复查删除，未解决 7 天后自动清理。
ALTER TABLE account_holds ADD COLUMN detail TEXT;
-- send_attempts.template_id：多模板轮换时记录这一条用了哪个模板。
ALTER TABLE send_attempts ADD COLUMN template_id TEXT;
CREATE INDEX IF NOT EXISTS account_holds_account_created ON account_holds(account_id,created_at);
