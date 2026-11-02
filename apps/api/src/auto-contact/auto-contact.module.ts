import {PendingRepliesService} from './pending-replies.service';
import {NormalAcceptanceService} from './normal-acceptance.service';
import {automationPreferenceInput,readAutomationPreferences,saveAutomationPreferences} from './automation-preferences';
import {journeySummary} from './journey-summary';
import { DevicesModule } from '../devices/devices';
import { DeviceService } from '../devices/device.service';
import { LoginRuntime } from '../accounts/login-runtime';
import { Db } from '../common/db';
import { LocalXhsReplySender } from './local-xhs-reply-sender';
import {LocalXhsDmSender,ChannelContactSender} from './local-xhs-dm-sender';
import {LocalDmExecutor} from '../direct-messages/dm-executor';
import { Controller, Get, Put, Post, Param, Query, Req, Inject, Module, UseGuards, Header } from '@nestjs/common';
import { z } from 'zod';
import { autoContactRuleInput, autoContactToggleInput, contactStatuses } from '@crm/contracts';
import { AuthModule, SessionGuard, type AuthedRequest } from '../auth/auth';
import { parse } from '../common/validation';
import { ContactSettingsService } from './contact-settings.service';
import { AutoContactService } from './auto-contact.service';
import { CONTACT_SENDER } from './contact-sender';
@Controller('auto-contact')
@UseGuards(SessionGuard)
class AutoContactController {
    constructor(
    @Inject(ContactSettingsService)
    private settings: ContactSettingsService, @Inject(PendingRepliesService) private pending:PendingRepliesService,
    @Inject(AutoContactService)
    private service: AutoContactService, @Inject(NormalAcceptanceService) private acceptance:NormalAcceptanceService, @Inject(Db) private db: Db, @Inject(CONTACT_SENDER) private sender: import('./contact-sender').ContactSender) { }
    @Get('pending') @Header('Cache-Control','no-store, private') pendingList(@Req() r:AuthedRequest,@Query() q:unknown){const b=parse(z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0),runId:z.string().min(1).max(200).optional()}).strict(),q);return this.pending.list(r.actor,b.offset,b.runId);}
    @Post('pending/preview') previewPending(@Req() r:AuthedRequest){return this.pending.preview(r.actor,r.body);}
    @Post('pending/confirm') confirmPending(@Req() r:AuthedRequest){return this.pending.confirm(r.actor,r.body);}
    @Get('acceptance') acceptanceStatus(@Req() r:AuthedRequest){return this.acceptance.status(r.actor);}
    @Post('acceptance') armAcceptance(@Req() r:AuthedRequest){return this.acceptance.arm(r.actor,r.body);}
    @Post('acceptance/:id/reply-exception') replyException(@Req() r:AuthedRequest,@Param('id') id:string){return this.acceptance.armReplyException(r.actor,id,r.body);}
    @Post('acceptance/:id/close') closeAcceptance(@Req() r:AuthedRequest,@Param('id') id:string){return this.acceptance.close(r.actor,id);}
    @Get()
    @Header('Cache-Control', 'no-store, private')
    overview(
    @Req()
    r: AuthedRequest) { return this.settings.overview(r.actor); }
    @Get('preferences') preferences(@Req() r:AuthedRequest){return readAutomationPreferences(this.db,r.actor);}
    @Put('preferences') select(@Req() r:AuthedRequest){return saveAutomationPreferences(this.db,r.actor,parse(automationPreferenceInput,r.body));}
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
    @Get('attempts')
    @Header('Cache-Control', 'no-store, private')
    history(@Req() r: AuthedRequest, @Query() q: unknown) {
        const b = parse(z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0), outcome:z.enum(['NOT_ATTEMPTED','CONFIRMED','FAILED','UNKNOWN','RESERVED','ATTEMPTED','CANCELLED','SIMULATED_SUCCESS']).optional()}).strict(),q);
        return this.settings.history(r.actor,b.offset,b.outcome);
    }
    @Get('journey')
    @Header('Cache-Control', 'no-store, private')
    journey(@Req() r: AuthedRequest, @Query() q: unknown) {
      const b=parse(z.object({runId:z.string().min(1).max(200),policyId:z.string().min(1).max(200).optional(),policyRevision:z.coerce.number().int().positive().optional()}).strict(),q);
      return journeySummary(this.db,r.actor,this.sender.mode,b.runId,b.policyId,b.policyRevision);
    }
    @Get('jobs')
    @Header('Cache-Control', 'no-store, private')
    jobs(
    @Req()
    r: AuthedRequest,
    @Query()
    q: unknown) { const b = parse(z.object({ offset: z.coerce.number().int().min(0).max(1000000).default(0), status: z.enum(contactStatuses).optional(), runId:z.string().min(1).max(200).optional() }).strict(), q); return this.settings.jobs(r.actor, b.offset, b.status, b.runId); }
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
@Module({ imports: [AuthModule, DevicesModule], controllers: [AutoContactController], providers: [PendingRepliesService, NormalAcceptanceService, LoginRuntime, { provide: CONTACT_SENDER, useFactory: (db: Db, devices: DeviceService, runtime: LoginRuntime) => new ChannelContactSender(new LocalXhsReplySender(db, devices, runtime),new LocalXhsDmSender(db,runtime,new LocalDmExecutor(db,devices,runtime))), inject: [Db, DeviceService, LoginRuntime] }, ContactSettingsService, AutoContactService], exports: [AutoContactService] })
export class AutoContactModule {
}
