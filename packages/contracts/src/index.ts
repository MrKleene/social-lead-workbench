import { z } from "zod";
export const protocolVersion = 1 as const;
export const healthTask = z
  .object({
    version: z.literal(protocolVersion),
    id: z.string().min(1),
    type: z.literal("HEALTHCHECK"),
    accountStatus: z.enum(["UNCONNECTED", "PAUSED", "RESTRICTED"]),
  })
  .strict();
export type HealthTask = z.infer<typeof healthTask>;
export const healthResult = z
  .object({
    version: z.literal(1),
    taskId: z.string(),
    status: z.literal("SKIPPED"),
    reason: z.literal("PLATFORM_CALLS_DISABLED"),
  })
  .strict();

export const internalJob = z.object({version:z.literal(1),type:z.literal("HEALTHCHECK")}).strict();

export const replyFields = ['昵称', '关键词', '帖子标题', '平台', '专业'] as const;
export function previewReply(body: string, context: Partial<Record<typeof replyFields[number], string>>) {
  const missing = new Set<string>(), unknown = new Set<string>();
  const text = body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, field: string) => {
    if (!(replyFields as readonly string[]).includes(field)) { unknown.add(field); return `【未知字段：${field}】`; }
    const value = context[field as typeof replyFields[number]];
    if (!value) { missing.add(field); return `【缺少来源字段：${field}】`; }
    return value;
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}
export const replyDraft = z.object({ name: z.string().trim().min(1).max(80), channel: z.enum(['COMMENT', 'DM']), body: z.string().trim().min(1).max(2000) }).strict()
  .refine(v => previewReply(v.body, {}).unknown.length === 0, '话术包含未知占位符；仅支持昵称、关键词、帖子标题、平台、专业')
  .refine(v => !/[{}]/.test(v.body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, '')), '占位符必须使用 {{字段}} 格式');

export * from './coverage-diagnostic';
export * from './image-diagnostic';
export * from './post-cover';
export * from './capture-display';
export * from './collection-diagnostic';
export * from './comment-rules';
export * from './semantic-review';
export * from './run-post-feed';

export * from './bounded-read';

export * from './search-observation';

export * from './run-coverage';

export * from './comment-checkpoint';

export * from './xhs-reference-parameters';
