import { RunMetrics,safeCollectionDiagnostic,safeSearchAttempts } from '@crm/contracts';
import { assessComment } from './comment-rules';
import { Prisma, CollectionRun, CollectionConfig } from "@prisma/client";
import { Db } from "../common/db";
import { ReadResult } from "./collector";
import { accountReadMode, requireMcp } from "./mcp/policy";
import { classify, configInput, ReadFailure } from "./contract";
export async function commitRead(db: Db, run: CollectionRun, result: ReadResult, guard?: (tx:Prisma.TransactionClient)=>Promise<void>) {
    for (let attempt = 0; attempt < 4; attempt++)
        try {
            return await db.$transaction(async (tx) => {
                if(guard) await guard(tx);
                // Serialize pause/config changes against the final write, not against network work.
                const [config] = await tx.$queryRaw<CollectionConfig[]> `SELECT * FROM "CollectionConfig" WHERE id=${run.configId} FOR UPDATE`;
                const current = await tx.collectionRun.findUniqueOrThrow({ where: { id: run.id } });
                if (current.status !== "RUNNING")
                    return current;
                if (!config.enabled || config.archivedAt || config.revision !== run.revision || current.cancelRequested) {
                    await tx.collectionConfig.update({ where: { id: config.id }, data: { activeRunId: null } });
                    return tx.collectionRun.update({ where: { id: run.id }, data: { status: "PAUSED", reason: "PAUSED", finishedAt: new Date() } });
                }
                const parsed = configInput.safeParse(run.snapshot);
                if (!parsed.success && result.posts.length) throw new ReadFailure("INVALID_DATA");
                const spec = parsed.success ? parsed.data : { mode: "MOCK" as const, platform: "XHS" as const, keywords: [], excludeWords: [], commentRules: null, semanticRules:null };
                if (spec.mode !== "MOCK" && result.posts.length) {
                    if(run.execution){if(!guard||accountReadMode()!==spec.mode)throw new ReadFailure("REAL_DISABLED");}
                    else {if(accountReadMode())throw new ReadFailure("REAL_DISABLED");requireMcp(spec.mode);}
                }
                const isDemo = spec.mode !== "XHS_MCP";
                const prefix = spec.mode === "MOCK" ? "【模拟】" : spec.mode === "XHS_FIXTURE" ? "【离线MCP夹具】" : "【小红书只读】";
                const diagnostic=safeCollectionDiagnostic(result.diagnostic);
                const searchAttempts=safeSearchAttempts(result.searchAttempts);
                const metrics:RunMetrics={...(searchAttempts?{searchAttempts}:{}),...(diagnostic?{diagnostic}:{}),version:1,discarded:!!result.discarded,policy:spec.commentRules?'INDEPENDENT_V1':'LEGACY',postsRead:result.posts.length,rootComments:0,replies:0,highRelevant:0,needsReview:0,unmatched:0,legacyMatches:0,filterReasons:{}};
                let observed = 0, matched = 0, added = 0, notices = 0;
                for (const entry of result.posts) {
                    const monitor = await tx.monitorPost.upsert({ where: { configId_revision_platformPostId: { configId: config.id, revision: run.revision, platformPostId: entry.post.id } }, create: { configId: config.id, revision: run.revision, platformPostId: entry.post.id }, update: {} });
                    const seen = new Set<string>();
                    const contextComments=new Map(entry.comments.map(c=>[c.id,c]));
                    const established = spec.mode === "MOCK" ? !!monitor.baselineAt : !!monitor.lastRunId;
                    const windowSucceeded = spec.mode === "MOCK" || !!entry.windowRead;
                    for (const c of entry.comments) {
                        if (![entry.post.id, c.id, c.userId, ...(c.parentId ? [c.parentId] : [])].every(x => spec.mode === "MOCK" ? x.startsWith("demo-collect-") : spec.mode === "XHS_FIXTURE" ? x.startsWith("fixture-xhs-") : !/^(demo-|fixture-)/.test(x)))
                            throw new ReadFailure("INVALID_DATA");
                        observed++;
                        if(c.parentId)metrics.replies++;else metrics.rootComments++;
                        seen.add(c.id);
                        const prior = await tx.commentObservation.findUnique({ where: { monitorId_platformCommentId: { monitorId: monitor.id, platformCommentId: c.id } } });
                        await tx.commentObservation.upsert({ where: { monitorId_platformCommentId: { monitorId: monitor.id, platformCommentId: c.id } }, create: { monitorId: monitor.id, platformCommentId: c.id, lastRunId: run.id }, update: { state: "PRESENT", lastRunId: run.id, lastSeenAt: new Date() } });
                        const assessment=spec.commentRules?assessComment(c,entry.post,c.parentId?contextComments.get(c.parentId):undefined,spec.commentRules,spec.excludeWords):null;
                        const hit=assessment?(assessment.classification==='NO_MATCH'?null:assessment):classify(c.text,spec.keywords,spec.excludeWords);
                        if (!hit) {metrics.unmatched++;const reason=assessment?.reason||(spec.excludeWords.some(w=>c.text.normalize('NFKC').toLowerCase().includes(w.normalize('NFKC').toLowerCase()))?'EXCLUDED':'NO_SIGNAL');metrics.filterReasons[reason]=(metrics.filterReasons[reason]||0)+1;continue;}
                        if(assessment?.classification==='HIGH_RELEVANT')metrics.highRelevant++;else if(assessment)metrics.needsReview++;else metrics.legacyMatches++;
                        matched++;
                        const identity = await tx.platformIdentity.upsert({ where: { platform_platformUserId: { platform: spec.platform, platformUserId: c.userId } }, create: { platform: spec.platform, platformUserId: c.userId, nickname: c.nickname, isDemo }, update: {} });
                        const post = await tx.sourcePost.upsert({ where: { platform_platformPostId: { platform: spec.platform, platformPostId: entry.post.id } }, create: { platform: spec.platform, platformPostId: entry.post.id, title: entry.post.title, isDemo }, update: {} });
                        if (identity.isDemo !== isDemo || post.isDemo !== isDemo)
                            throw new ReadFailure("INVALID_DATA");
                        const existing = await tx.sourceComment.findUnique({ where: { platform_platformCommentId: { platform: spec.platform, platformCommentId: c.id } } });
                        const source = await tx.sourceComment.upsert({ where: { platform_platformCommentId: { platform: spec.platform, platformCommentId: c.id } }, create: { platform: spec.platform, platformCommentId: c.id, identityId: identity.id, postId: post.id, originalText: c.text, parentPlatformCommentId: c.parentId, isDemo }, update: {} });
                        if (source.isDemo !== isDemo || source.identityId !== identity.id || source.postId !== post.id || source.originalText !== c.text || source.parentPlatformCommentId !== (c.parentId || null))
                            throw new ReadFailure("INVALID_DATA");
                        const priorLead = await tx.lead.findUnique({ where: { identityId: identity.id } });
                        if (priorLead && priorLead.isDemo !== isDemo)
                            throw new ReadFailure("INVALID_DATA");
                        const lead = await tx.lead.upsert({ where: { identityId: identity.id }, create: { identityId: identity.id, summary: `${prefix}${hit.keywords.join("、")} · ${assessment ? `${assessment.classification==='HIGH_RELEVANT'?'规则高相关':'待核查'}，需人工核验，未同意营销` : hit.classification === "POSSIBLE_HELP" ? "可能求助，待人工核验，未同意营销" : "仅专业相关"}`, evidence: c.text, isDemo }, update: {} });
                        if (!priorLead)
                            added++;
                        await tx.sourceMatch.upsert({ where: { configId_revision_commentId: { configId: config.id, revision: run.revision, commentId: source.id } }, create: { configId: config.id, revision: run.revision, runId: run.id, commentId: source.id, keywords: hit.keywords, classification: hit.classification, ...(assessment?{assessment:assessment as unknown as Prisma.InputJsonValue}:{}), isBaseline: !established }, update: {} });
                        if (established && windowSucceeded && !prior && !existing) {
                            const created = await tx.collectionNotice.createMany({ data: [{ commentId: source.id, leadId: lead.id, title: spec.mode === "MOCK" ? "【模拟】发现新的相关评论 · 待人工核验" : `${prefix}新观察到相关评论 · 仅已读窗口，未验证发布时间` }], skipDuplicates: true });
                            notices += created.count;
                        }
                    }
                    // Missing from a complete read is still NOT a deletion assertion.
                    if (entry.complete)
                        await tx.commentObservation.updateMany({ where: { monitorId: monitor.id, platformCommentId: { notIn: [...seen] }, state: "PRESENT" }, data: { state: "MISSING_UNCONFIRMED", lastRunId: run.id } });
                    const deleted = entry.deletedIds.filter(id => !seen.has(id));
                    if (deleted.length)
                        await tx.commentObservation.updateMany({ where: { monitorId: monitor.id, platformCommentId: { in: deleted } }, data: { state: "DELETED_CONFIRMED", lastRunId: run.id } });
                    await tx.monitorPost.update({ where: { id: monitor.id }, data: { coverage: entry.complete ? "COMPLETE" : "PARTIAL", baselineAt: monitor.baselineAt || (entry.complete ? new Date() : null), lastRunId: windowSucceeded ? run.id : monitor.lastRunId } });
                }
                const failed = result.status === "FAILED";
                const restricted = ["RESTRICTED", "LOGIN_EXPIRED", "RATE_LIMITED", "IDENTITY_MISMATCH"].includes(result.reason || "");
                await tx.collectionConfig.update({ where: { id: config.id }, data: { activeRunId: null, failureCount: failed ? { increment: 1 } : 0, nextAllowedAt: failed ? new Date(Date.now() + Math.max(result.retryAfterMs || 0, Math.min(300000, 30000 * 2 ** Math.min(config.failureCount, 4)))) : null, ...(restricted ? { enabled: false, pauseReason: result.reason } : {}) } });
                const finished = await tx.collectionRun.update({ where: { id: run.id }, data: { status: result.status, reason: result.reason || null, requests: result.requests, observed, matched, added, notices, metrics:metrics as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
                await tx.auditLog.create({ data: { action: spec.mode === "MOCK" ? "COLLECTION_FINISHED_MOCK" : "COLLECTION_FINISHED_MCP", entityId: run.id, metadata: { mode: spec.mode, status: result.status, reason: result.reason || null, observed, matched, added, notices,...(diagnostic?{diagnostic}:{}),...(searchAttempts?{searchAttempts}:{}) } } });
                return finished;
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
        }
        catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 3)
                continue;
            throw error;
        }
    throw new Error("Unreachable");
}
