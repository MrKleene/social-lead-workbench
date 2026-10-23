import {z} from 'zod';
import {boundedReadReportSchema,boundedReadReasons} from './bounded-read';
const reasons=z.enum([...boundedReadReasons,'SEARCH_PARTIAL','COMMENTS_PARTIAL','MCP_WINDOW_ONLY'] as const);
/** Immutable per-run evidence, no source text, identity, URL or cursor value. */
export const runCoverageSchema=z.object({version:z.literal(1),search:z.enum(['COMPLETE','PARTIAL','UNKNOWN']),reasons:z.array(reasons).max(32),posts:z.array(z.object({ordinal:z.number().int().min(1).max(10),saved:z.number().int().min(0).max(100),roots:z.number().int().min(0).max(100),replies:z.number().int().min(0).max(100),complete:z.boolean(),reason:reasons.optional(),boundedRead:boundedReadReportSchema.optional()}).strict().refine(p=>p.saved===p.roots+p.replies)).max(10)}).strict();
export type RunCoverage=z.infer<typeof runCoverageSchema>;
export function safeRunCoverage(value:unknown):RunCoverage|undefined {const p=runCoverageSchema.safeParse(value);return p.success?p.data:undefined;}
