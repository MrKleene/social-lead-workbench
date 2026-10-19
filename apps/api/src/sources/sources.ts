import {
  BadRequestException,
  Inject,
  Injectable,
  Module,
} from "@nestjs/common";
import { Platform, Prisma } from "@prisma/client";
import { Db } from "../common/db";
export type DemoSource = {
  platform: Platform;
  userId: string;
  nickname: string;
  postId: string;
  postTitle: string;
  commentId: string;
  originalText: string;
  summary: string;
};
// No public ingestion endpoint in milestone 1. Seeds and tests only.
@Injectable()
export class SourcesService {
  constructor(@Inject(Db) private db: Db) {}
  async ingestDemo(input: DemoSource) {
    if (
      ![input.userId, input.postId, input.commentId].every((v) =>
        v.startsWith("demo-"),
      )
    )
      throw new BadRequestException("仅允许明确标注的虚构来源");
    for (let attempt = 0; attempt < 3; attempt++)
      try {
        return await this.db.$transaction(
          async (tx) => {
            const identity = await tx.platformIdentity.upsert({
              where: {
                platform_platformUserId: {
                  platform: input.platform,
                  platformUserId: input.userId,
                },
              },
              create: {
                platform: input.platform,
                platformUserId: input.userId,
                nickname: input.nickname,
                isDemo: true,
              },
              update: {},
            });
            const post = await tx.sourcePost.upsert({
              where: {
                platform_platformPostId: {
                  platform: input.platform,
                  platformPostId: input.postId,
                },
              },
              create: {
                platform: input.platform,
                platformPostId: input.postId,
                title: input.postTitle,
                isDemo: true,
              },
              update: {},
            });
            const comment = await tx.sourceComment.upsert({
              where: {
                platform_platformCommentId: {
                  platform: input.platform,
                  platformCommentId: input.commentId,
                },
              },
              create: {
                platform: input.platform,
                platformCommentId: input.commentId,
                identityId: identity.id,
                postId: post.id,
                originalText: input.originalText,
                isDemo: true,
              },
              update: {},
            });
            if (
              comment.identityId !== identity.id ||
              comment.postId !== post.id ||
              comment.originalText !== input.originalText
            )
              throw new BadRequestException("来源 ID 冲突，保留原始证据");
            return tx.lead.upsert({
              where: { identityId: identity.id },
              create: {
                identityId: identity.id,
                summary: input.summary,
                evidence: input.originalText,
                isDemo: true,
              },
              update: {},
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2034", "P2002"].includes(e.code) &&
          attempt < 2
        )
          continue;
        throw e;
      }
    throw new Error("Unreachable");
  }
}
@Module({ providers: [SourcesService], exports: [SourcesService] })
export class SourcesModule {}
