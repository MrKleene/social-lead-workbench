import {z} from 'zod';
const count=z.number().int().nonnegative().nullable();
export const runPostItemSchema=z.object({
 id:z.string(),platformPostId:z.string(),title:z.string().max(500),body:z.string().max(20000).optional(),coverUrl:z.string().optional(),publishedAt:z.string().optional(),savedAt:z.string(),
 savedCount:count,rootCount:count,replyCount:count,newCount:count,reusedCount:count,
 coverage:z.string(),stopReason:z.string().nullable(),
});
export const runPostFeedSchema=z.object({version:z.literal(1),runId:z.string(),configId:z.string(),availability:z.enum(['AVAILABLE','SUPERSEDED']),status:z.string(),limited:z.boolean(),items:z.array(runPostItemSchema).max(100)});
export type RunPostItem=z.infer<typeof runPostItemSchema>;
export type RunPostFeed=z.infer<typeof runPostFeedSchema>;
