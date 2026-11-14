-- 系统内置配置：随应用发布的一组默认配置。
-- builtin=1 表示由应用提供，用户可编辑、不可删除；应用升级时只覆盖用户未改动过的内置项。
-- 内容定义在 src/builtin-configurations.cjs，由 LocalService.ensureBuiltinConfigurations() 幂等写入。
ALTER TABLE configurations ADD COLUMN builtin INTEGER NOT NULL DEFAULT 0 CHECK(builtin IN(0,1));
