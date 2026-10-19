import { Prisma, CollectionRun, CollectionConfig } from "@prisma/client";
import { Db } from "../common/db";
import { ReadResult } from "./collector";
import { classify, configInput, ReadFailure } from "./contract";
export async function commitRead(db: Db, run: CollectionRun, result: ReadResult) {
    for (let attempt = 0; attempt < 4; attempt++)
        try {
            return await db.$transaction(async (tx) => {
                // Serialize pause/config changes against the final write, not against network work.
                const [config] = await tx.$queryRaw<CollectionConfig[]> `SELECT * FROM "CollectionConfig" WHERE id=${run.configId} FOR UPDATE`;
                const current = await tx.collectionRun.findUniqueOrThrow({ where: { id: run.id } });
                if (current.status !== "RUNNING")
                    return current;
                if (!config.enabled || config.archivedAt || config.revision !== run.revision || current.cancelRequested) {
                    await tx.collectionConfig.update({ where: { id: config.id }, data: { activeRunId: null } });
                    return tx.collectionRun.update({ where: { id: run.id }, data: { status: "PAUSED", reason: "PAUSED", finishedAt: new Date() } });
                }
                let observed = 0, matched = 0, added = 0, notices = 0;
                for (const entry of result.posts) {
                    const spec = configInput.parse(run.snapshot);
                    if (spec.mode !== "MOCK")
                        throw new ReadFailure("REAL_DISABLED");
                    const monitor = await tx.monitorPost.upsert({ where: { configId_revision_platformPostId: { configId: config.id, revision: run.revision, platformPostId: entry.post.id } }, create: { configId: config.id, revision: run.revision, platformPostId: entry.post.id }, update: {} });
                    const seen = new Set<string>();
                    for (const c of entry.comments) {
                        if (![entry.post.id, c.id, c.userId].every(x => x.startsWith("demo-collect-")))
                            throw new ReadFailure("INVALID_DATA");
                        observed++;
                        seen.add(c.id);
                        const prior = await tx.commentObservation.findUnique({ where: { monitorId_platformCommentId: { monitorId: monitor.id, platformCommentId: c.id } } });
                        await tx.commentObservation.upsert({ where: { monitorId_platformCommentId: { monitorId: monitor.id, platformCommentId: c.id } }, create: { monitorId: monitor.id, platformCommentId: c.id, lastRunId: run.id }, update: { state: "PRESENT", lastRunId: run.id, lastSeenAt: new Date() } });
                        const hit = classify(c.text, spec.keywords, spec.excludeWords);
                        if (!hit)
                            continue;
                        matched++;
                        const identity = await tx.platformIdentity.upsert({ where: { platform_platformUserId: { platform: spec.platform, platformUserId: c.userId } }, create: { platform: spec.platform, platformUserId: c.userId, nickname: c.nickname, isDemo: true }, update: {} });
                        const post = await tx.sourcePost.upsert({ where: { platform_platformPostId: { platform: spec.platform, platformPostId: entry.post.id } }, create: { platform: spec.platform, platformPostId: entry.post.id, title: entry.post.title, isDemo: true }, update: {} });
                        if (!identity.isDemo || !post.isDemo)
                            throw new ReadFailure("INVALID_DATA");
                        const existing = await tx.sourceComment.findUnique({ where: { platform_platformCommentId: { platform: spec.platform, platformCommentId: c.id } } });
                        const source = await tx.sourceComment.upsert({ where: { platform_platformCommentId: { platform: spec.platform, platformCommentId: c.id } }, create: { platform: spec.platform, platformCommentId: c.id, identityId: identity.id, postId: post.id, originalText: c.text, parentPlatformCommentId: c.parentId, isDemo: true }, update: {} });
                        if (!source.isDemo || source.identityId !== identity.id || source.postId !== post.id || source.originalText !== c.text || source.parentPlatformCommentId !== (c.parentId || null))
                            throw new ReadFailure("INVALID_DATA");
                        const priorLead = await tx.lead.findUnique({ where: { identityId: identity.id } });
                        if (priorLead && !priorLead.isDemo)
                            throw new ReadFailure("INVALID_DATA");
                        const lead = await tx.lead.upsert({ where: { identityId: identity.id }, create: { identityId: identity.id, summary: `【模拟】${hit.keywords.join("、")} · ${hit.classification === "POSSIBLE_HELP" ? "可能求助，待人工核验" : "仅专业相关"}`, evidence: c.text, isDemo: true }, update: {} });
                        if (!priorLead)
                            added++;
                        await tx.sourceMatch.upsert({ where: { configId_revision_commentId: { configId: config.id, revision: run.revision, commentId: source.id } }, create: { configId: config.id, revision: run.revision, runId: run.id, commentId: source.id, keywords: hit.keywords, classification: hit.classification, isBaseline: !monitor.baselineAt }, update: {} });
                        if (monitor.baselineAt && !prior && !existing) {
                            const created = await tx.collectionNotice.createMany({ data: [{ commentId: source.id, leadId: lead.id, title: "【模拟】发现新的相关评论 · 待人工核验" }], skipDuplicates: true });
                            notices += created.count;
                        }
                    }
                    // Missing from a complete read is still NOT a deletion assertion.
                    if (entry.complete)
                        await tx.commentObservation.updateMany({ where: { monitorId: monitor.id, platformCommentId: { notIn: [...seen] }, state: "PRESENT" }, data: { state: "MISSING_UNCONFIRMED", lastRunId: run.id } });
                    const deleted = entry.deletedIds.filter(id => !seen.has(id));
                    if (deleted.length)
                        await tx.commentObservation.updateMany({ where: { monitorId: monitor.id, platformCommentId: { in: deleted } }, data: { state: "DELETED_CONFIRMED", lastRunId: run.id } });
                    await tx.monitorPost.update({ where: { id: monitor.id }, data: { coverage: entry.complete ? "COMPLETE" : "PARTIAL", baselineAt: monitor.baselineAt || (entry.complete ? new Date() : null), lastRunId: run.id } });
                }
                const failed = result.status === "FAILED";
                const restricted = ["RESTRICTED", "LOGIN_EXPIRED"].includes(result.reason || "");
                await tx.collectionConfig.update({ where: { id: config.id }, data: { activeRunId: null, failureCount: failed ? { increment: 1 } : 0, nextAllowedAt: failed ? new Date(Date.now() + Math.min(300000, 30000 * 2 ** Math.min(config.failureCount, 4))) : null, ...(restricted ? { enabled: false, pauseReason: result.reason } : {}) } });
                const finished = await tx.collectionRun.update({ where: { id: run.id }, data: { status: result.status, reason: result.reason || null, requests: result.requests, observed, matched, added, notices, finishedAt: new Date() } });
                await tx.auditLog.create({ data: { action: "COLLECTION_FINISHED_MOCK", entityId: run.id, metadata: { status: result.status, observed, matched, added, notices } } });
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
