-- 账号资料：登录核验时一并保存平台昵称与头像，供账号中心卡片展示。
-- 两者都是登录当时的展示快照，平台侧改名/换头像不会自动回写；
-- 缺失时前端回退到本地名称与首字，不阻断任何流程。
ALTER TABLE accounts ADD COLUMN nickname TEXT;
ALTER TABLE accounts ADD COLUMN avatar_url TEXT;
