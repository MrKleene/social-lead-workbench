import { BadRequestException, ConflictException, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { previewReply, replyDraft } from '@crm/contracts';
import { AuthModule, AuthedRequest, SessionGuard } from '../auth/auth';
import { requireAdmin } from '../auth/security';
import { Db } from '../common/db';
import { parse } from '../common/validation';
@Controller('reply-templates')
@UseGuards(SessionGuard)
class RepliesController {
  constructor(@Inject(Db) private db: Db) {}
  @Get() list(@Req() req: AuthedRequest) { requireAdmin(req.actor); return this.db.replyTemplate.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { _count: { select: { configs: true } } } }); }
  @Post() async create(@Req() req: AuthedRequest) {
    requireAdmin(req.actor); const draft = parse(replyDraft, req.body);
    return this.db.$transaction(async tx => {
      if (await tx.replyTemplate.count() >= 100) throw new BadRequestException('最多100套话术');
      const item = await tx.replyTemplate.create({ data: draft });
      await tx.auditLog.create({ data: { actorId: req.actor.id, entityId: item.id, action: 'REPLY_TEMPLATE_CREATED', metadata: { channel: item.channel } } }); return item;
    });
  }
  @Patch(':id') async edit(@Req() req: AuthedRequest, @Param('id') id: string) {
    requireAdmin(req.actor); const b = parse(z.object({ draft: replyDraft, version: z.number().int().nonnegative() }).strict(), req.body);
    return this.db.$transaction(async tx => {
      const updated = await tx.replyTemplate.updateMany({ where: { id, version: b.version }, data: { ...b.draft, version: { increment: 1 } } });
      if (!updated.count) throw new ConflictException('话术已变化或不存在，请刷新');
      await tx.auditLog.create({ data: { actorId: req.actor.id, entityId: id, action: 'REPLY_TEMPLATE_UPDATED' } });
      return tx.replyTemplate.findUniqueOrThrow({ where: { id } });
    });
  }
  @Delete(':id') async remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    requireAdmin(req.actor); const b = parse(z.object({ version: z.number().int().nonnegative() }).strict(), req.body);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "ReplyTemplate" WHERE id=${id} FOR UPDATE`;
      const item = await tx.replyTemplate.findUnique({ where: { id } });
      if (!item) throw new NotFoundException();
      if (item.version !== b.version) throw new ConflictException('话术已变化，请刷新');
      if(await tx.autoContactRule.count({where:{templateId:id}}))throw new ConflictException('仍有自动回复配置引用此模板，请先更换回复模板');
      if (await tx.collectionConfig.count({ where: { defaultReplyTemplateId: id } })) throw new ConflictException('仍有关联搜索设置（包括归档设置），请先解除默认话术关联');
      await tx.replyTemplate.delete({ where: { id } });
      await tx.auditLog.create({ data: { actorId: req.actor.id, entityId: id, action: 'REPLY_TEMPLATE_DELETED' } }); return { ok: true };
    });
  }
  @Post('preview') async preview(@Req() req: AuthedRequest) {
    requireAdmin(req.actor);
    const b = parse(z.object({ body: z.string().max(2000) }).strict(), req.body);
    return { ...previewReply(b.body, {}), source: '缺失字段不推断', sent: false };
  }
}
@Module({ imports: [AuthModule], controllers: [RepliesController] })
export class RepliesModule {}
