import {z} from 'zod';
/** 平台搜索面板的两组筛选值；只允许页面真实存在的选项。 */
export const searchFilterSchema=z.object({
  sortBy:z.enum(['综合','最新','最多点赞','最多评论','最多收藏']),
  publishTime:z.enum(['不限','一天内','一周内','半年内']),
}).strict();
export type SearchFilters=z.infer<typeof searchFilterSchema>;
/** 本轮固定使用的筛选：按点赞热度、只取一周内发布。 */
export const defaultSearchFilters:SearchFilters=Object.freeze({sortBy:'最多点赞',publishTime:'一周内'});
/**
 * 一轮搜索计划：预览时随机打乱全部关键词并生成种子，执行时按种子确定性
 * 抽取每个关键词的配额（1~当前剩余篇数）。顺序、种子、筛选都随授权哈希冻结。
 */
export const searchPlanSchema=z.object({
  version:z.literal(2),
  order:z.array(z.string().trim().min(1).max(40)).min(1).max(100),
  seed:z.string().regex(/^[a-f0-9]{32}$/),
  filters:searchFilterSchema,
}).strict();
export type SearchPlan=z.infer<typeof searchPlanSchema>;
