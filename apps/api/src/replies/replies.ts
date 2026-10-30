import { BadRequestException, ConflictException, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { previewReply, replyDraft } from '@crm/contracts';
import { AuthModule, AuthedRequest, SessionGuard } from '../auth/auth';
import { requireAdmin, scope } from '../auth/security';
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
      if(await tx.autoContactRule.count({where:{templateId:id}}))throw new ConflictException('仍有自动回复配置引用此模板，请先更换发送模板');
      if (await tx.collectionConfig.count({ where: { defaultReplyTemplateId: id } })) throw new ConflictException('仍有关联搜索设置（包括归档设置），请先解除默认话术关联');
      await tx.replyTemplate.delete({ where: { id } });
      await tx.auditLog.create({ data: { actorId: req.actor.id, entityId: id, action: 'REPLY_TEMPLATE_DELETED' } }); return { ok: true };
    });
  }
  @Post('preview') async preview(@Req() req: AuthedRequest) {
    requireAdmin(req.actor);
    const b = parse(z.object({ body: z.string().max(2000), leadId: z.string().optional() }).strict(), req.body);
    if (!b.leadId) return { ...previewReply(b.body, {}), source: '未选择来源，缺失字段不推断', sent: false };
    const lead = await this.db.lead.findFirst({ where: { id: b.leadId, ...scope(req.actor) }, include: { identity: { include: { comments: { orderBy: { observedAt: 'desc' }, take: 1, include: { post: true, matches: true } } } } } });
    if (!lead) throw new NotFoundException('线索不存在或无权访问');
    const comment = lead.identity.comments[0];
    return { ...previewReply(b.body, { 昵称: lead.identity.nickname, 平台: lead.identity.platform === 'XHS' ? '小红书' : '抖音', 帖子标题: comment?.post.title, 关键词: comment?.matches.flatMap(m => m.keywords).join('、') }), source: '所选用户最近一条来源评论；专业未采集', sent: false };
  }
  @Get('for-lead/:id') async forLead(@Req() req: AuthedRequest, @Param('id') id: string) {
    const lead = await this.db.lead.findFirst({ where: { id, ...scope(req.actor) }, include: { identity: { include: { comments: { orderBy: { observedAt: 'desc' }, take: 8, include: { post: true, matches: { include: { config: { include: { defaultReplyTemplate: true } } } } } } } } } });
    if (!lead) throw new NotFoundException('线索不存在或无权访问');
    return lead.identity.comments.flatMap(c => c.matches.flatMap(m => { const t = m.config.defaultReplyTemplate; return t ? [{ templateId: t.id, name: t.name, channel: t.channel, post: c.post.title, ...previewReply(t.body, { 昵称: lead.identity.nickname, 平台: lead.identity.platform === 'XHS' ? '小红书' : '抖音', 帖子标题: c.post.title, 关键词: m.keywords.join('、') }), sent: false }] : []; }));
  }
}
@Module({ imports: [AuthModule], controllers: [RepliesController] })
export class RepliesModule {}
