import { Controller, Get, Put, Post, Param, Query, Req, Inject, Module, UseGuards, Header } from '@nestjs/common';
import { z } from 'zod';
import { autoContactRuleInput, autoContactToggleInput, contactStatuses } from '@crm/contracts';
import { AuthModule, SessionGuard, type AuthedRequest } from '../auth/auth';
import { parse } from '../common/validation';
import { ContactSettingsService } from './contact-settings.service';
import { AutoContactService } from './auto-contact.service';
import { CONTACT_SENDER, UnavailableContactSender } from './contact-sender';
@Controller('auto-contact')
@UseGuards(SessionGuard)
class AutoContactController {
    constructor(
    @Inject(ContactSettingsService)
    private settings: ContactSettingsService,
    @Inject(AutoContactService)
    private service: AutoContactService) { }
    @Get()
    @Header('Cache-Control', 'no-store, private')
    overview(
    @Req()
    r: AuthedRequest) { return this.settings.overview(r.actor); }
    @Put('rules/:id')
    save(
    @Req()
    r: AuthedRequest,
    @Param('id')
    id: string) { return this.settings.save(r.actor, parse(z.string().min(1).max(100), id), parse(autoContactRuleInput, r.body)); }
    @Post('rules/:id/enabled')
    toggle(
    @Req()
    r: AuthedRequest,
    @Param('id')
    id: string) { return this.settings.toggle(r.actor, id, parse(autoContactToggleInput, r.body)); }
    @Get('jobs')
    @Header('Cache-Control', 'no-store, private')
    jobs(
    @Req()
    r: AuthedRequest,
    @Query()
    q: unknown) { const b = parse(z.object({ offset: z.coerce.number().int().min(0).max(1000000).default(0), status: z.enum(contactStatuses).optional() }).strict(), q); return this.settings.jobs(r.actor, b.offset, b.status); }
    @Post('jobs/:id/cancel')
    cancel(
    @Req()
    r: AuthedRequest,
    @Param('id')
    id: string) { parse(z.object({}).strict(), r.body); return this.settings.cancel(r.actor, id); }
    @Post('jobs/:id/reconcile')
    reconcile(
    @Req()
    r: AuthedRequest,
    @Param('id')
    id: string) { const b = parse(z.object({ receipt: z.string().trim().min(1).max(500) }).strict(), r.body); return this.service.reconcile(r.actor, id, b.receipt); }
}
@Module({ imports: [AuthModule], controllers: [AutoContactController], providers: [{ provide: CONTACT_SENDER, useClass: UnavailableContactSender }, ContactSettingsService, AutoContactService], exports: [AutoContactService] })
export class AutoContactModule {
}
