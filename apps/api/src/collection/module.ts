import {AutoContactModule} from '../auto-contact/auto-contact.module';
import {ManualReviewService} from '../comment-review/manual-review.service';
import {AutoReviewService} from '../comment-review/auto-review.service';
import {CommentReviewController} from '../comment-review/comment-review.controller';
import {ReviewPolicyService} from '../comment-review/review-policy.service';
import {ReviewEvaluationService} from '../comment-review/review-evaluation.service';
import {availabilityInput} from '@crm/contracts';
import {savedPostPageInput} from './saved-post-page';
import {readPlanSchema} from './saved-post-read';
import { Controller, Get, Post, Patch, Delete, Param, Query, Req, Inject, Module, UseGuards, NotFoundException, Res, Header } from "@nestjs/common";
import type {Response} from 'express';
import {AccountsModule} from '../accounts/accounts';
import {SinglePostService,singlePostInput} from './single-post.service';
import { z } from "zod";
import { AuthModule, AuthedRequest, SessionGuard } from "../auth/auth";
import { scope } from "../auth/security";
import { Db } from "../common/db";
import { parse } from "../common/validation";
import { LeadsModule } from "../leads/leads";
import { LeadsService } from "../leads/leads.service";
import { DevicesModule } from "../devices/devices";
import { LoginRuntime } from "../accounts/login-runtime";
import { AccountReadService } from "./account-read.service";
import { CollectionService } from "./service";
import { CollectionQueue } from "./queue";
import { configInput, scenarioSchema } from "./contract";
import { semanticEvaluateRequestSchema } from '@crm/contracts';
import { QwenMatchingService } from './qwen-matching.service';
import {ModelSettingsModule} from '../model-settings/model-settings.module';
import { CaptureService } from './capture.service';
import {commentStreamInput} from './saved-comment-stream';
import { SemanticService } from './semantic.service';
@Controller("collection")
@UseGuards(SessionGuard)
class CollectionController {
    constructor(
    @Inject(CollectionService)
    private service: CollectionService, @Inject(SemanticService) private semantic:SemanticService, @Inject(QwenMatchingService) private qwen:QwenMatchingService, @Inject(CaptureService) private captures:CaptureService,@Inject(SinglePostService) private singlePost:SinglePostService) { }
    @Post("single-post-check") @Header("Cache-Control","no-store, private")
    singlePostCheck(@Req() r:AuthedRequest){return this.singlePost.check(r.actor,parse(singlePostInput,r.body));}
    @Get('captured-posts/:id/availability') @Header('Cache-Control','no-store, private')
    availability(@Req() r:AuthedRequest,@Param('id') id:string){return this.captures.availability(r.actor,id);}
    @Post('captured-posts/:id/availability/recheck') @Header('Cache-Control','no-store, private')
    recheckAvailability(@Req() r:AuthedRequest,@Param('id') id:string){parse(z.object({}).strict(),r.body);return this.captures.availability(r.actor,id);}
    @Patch('captured-posts/:id/availability')
    markAvailability(@Req() r:AuthedRequest,@Param('id') id:string){return this.captures.markAvailability(r.actor,id,parse(availabilityInput,r.body));}
    @Get("captured-posts/:id/source") @Header("Cache-Control","no-store, private") @Header("Referrer-Policy","no-referrer")
    async original(@Req() r:AuthedRequest,@Param("id") id:string,@Res() response:Response){response.setHeader("Cache-Control","no-store, private");response.setHeader("Referrer-Policy","no-referrer");response.redirect(302,await this.captures.source(r.actor,id));}
    @Post("configs/:id/capture-preview")
    capturePreview(@Req() r:AuthedRequest,@Param("id") id:string){const b=parse(z.object({captureIds:z.array(z.string().min(1)).min(1).max(5).refine(a=>new Set(a).size===a.length)}).strict(),r.body);return this.captures.preview(r.actor,id,b.captureIds);}
    @Get('configs/:id/runs/:runId/posts')
    runPosts(@Req() r:AuthedRequest,@Param('id') id:string,@Param('runId') runId:string){return this.captures.runPosts(r.actor,id,runId);}
    @Get('configs/:id/posts') @Header('Cache-Control','no-store, private')
    savedPosts(@Req() r:AuthedRequest,@Param('id') id:string,@Query() query:unknown){return this.captures.posts(r.actor,id,parse(savedPostPageInput,query));}
    @Get("configs/:id/captures")
    capturesList(@Req() r:AuthedRequest,@Param('id') id:string,@Query('offset') offset?:string,@Query('postId') postId?:string){return this.captures.list(r.actor,id,parse(z.coerce.number().int().min(0).max(100000).default(0),offset),parse(z.string().min(1).max(200).optional(),postId));}
    @Get('configs/:id/comment-stream') @Header('Cache-Control','no-store, private')
    commentStream(@Req() r:AuthedRequest,@Param('id') id:string,@Query() query:unknown){return this.captures.commentStream(r.actor,id,parse(commentStreamInput,query));}
    @Patch('configs/:id/semantic-control')
    semanticControl(@Req() r:AuthedRequest,@Param('id') id:string){return this.captures.toggle(r.actor,id,parse(z.object({enabled:z.boolean(),version:z.number().int().nonnegative()}).strict(),r.body));}
    @Post('configs/:id/semantic-queue')
    semanticQueue(@Req() r:AuthedRequest,@Param('id') id:string){const b=parse(z.object({captureIds:z.array(z.string().min(1).max(200)).min(1).max(5).refine(a=>new Set(a).size===a.length)}).strict(),r.body);return this.captures.enqueue(r.actor,id,b.captureIds);}
    @Get('configs/:id/semantic-reviews')
    reviews(@Req() r:AuthedRequest,@Param('id') id:string,@Query('offset') offset?:string){return this.semantic.list(r.actor,id,parse(z.coerce.number().int().min(0).max(100000).default(0),offset));}
    @Post('configs/:id/semantic-preview')
    preview(@Req() r:AuthedRequest,@Param('id') id:string){const b=parse(z.object({reviewIds:z.array(z.string().min(1).max(200)).min(1).max(5).optional()}).strict(),r.body);return this.qwen.preview(r.actor,id,b.reviewIds);}
    @Post('configs/:id/semantic-evaluate')
    evaluate(@Req() r:AuthedRequest,@Param('id') id:string){if(r.body&&Object.keys(r.body).length===0)return this.semantic.evaluate(r.actor,id);return this.qwen.evaluate(r.actor,id,parse(semanticEvaluateRequestSchema,r.body));}
    @Patch('semantic-reviews/:id')
    review(@Req() r:AuthedRequest,@Param('id') id:string){return this.semantic.review(r.actor,id,parse(z.object({version:z.number().int().nonnegative(),decision:z.enum(['APPROVED','REJECTED']),note:z.string().trim().min(1).max(500)}).strict(),r.body));}
    @Get("mcp/readiness")
    readiness(@Req() r: AuthedRequest) { return this.service.readiness(r.actor); }
    @Post("mcp/check")
    check(@Req() r: AuthedRequest) { parse(z.object({}).strict(), r.body); return this.service.checkReadiness(r.actor); }
    @Get("dashboard") @Header("Cache-Control","no-store, private")
    dashboard(@Req() r:AuthedRequest){return this.service.dashboard(r.actor);}
    @Get("configs")
    list(
    @Req()
    r: AuthedRequest) { return this.service.list(r.actor); }
    @Get("configs/:id")
    detail(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { return this.service.detail(r.actor, id); }
    @Post("configs")
    create(
    @Req()
    r: AuthedRequest) { return this.service.create(r.actor, parse(configInput, r.body)); }
    @Patch("configs/:id")
    update(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { const b = parse(z.object({ config: configInput, revision: z.number().int().positive() }).strict(), r.body); return this.service.change(r.actor, id, b.config, b.revision, true); }
    @Patch("configs/:id/enabled")
    toggle(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { const b = parse(z.object({ enabled: z.boolean(), revision: z.number().int().positive() }).strict(), r.body); return this.service.change(r.actor, id, { enabled: b.enabled }, b.revision, false); }
    @Delete("configs/:id")
    archive(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { const b = parse(z.object({ revision: z.number().int().positive() }).strict(), r.body); return this.service.change(r.actor, id, { enabled: false, archivedAt: new Date() }, b.revision, false); }
    @Post("configs/:id/runs")
    run(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { const b = parse(z.object({ scenario: scenarioSchema, requestKey: z.string().uuid(), mode: z.enum(["MOCK", "XHS_FIXTURE", "XHS_MCP"]), accountId:z.string().min(1).max(100).optional(), consent:z.literal("account-read-window-v1").optional(), readPlan:readPlanSchema.optional() }).strict(), r.body); return this.service.start(r.actor, id, b.scenario, b.requestKey, b.mode, b.accountId, b.consent, b.readPlan); }
    @Post("runs/:id/pause")
    pause(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { parse(z.object({}).strict(), r.body); return this.service.pauseRun(r.actor, id); }
}
@Controller("notices")
@UseGuards(SessionGuard)
class NoticesController {
    constructor(
    @Inject(Db)
    private db: Db, 
    @Inject(LeadsService)
    private leads: LeadsService) { }
    @Get()
    list(
    @Req()
    r: AuthedRequest) { return this.db.collectionNotice.findMany({ where: { lead: scope(r.actor) }, include: { lead: { select: { id: true, identity: { select: { nickname: true } }, ownerId: true } }, reads: { where: { userId: r.actor.id }, select: { readAt: true } } }, take: 100, orderBy: { createdAt: "desc" } }); }
    @Post(":id/read")
    async read(
    @Req()
    r: AuthedRequest, 
    @Param("id")
    id: string) { parse(z.object({}).strict(), r.body); const notice = await this.db.collectionNotice.findFirst({ where: { id, lead: scope(r.actor) } }); if (!notice)
        throw new NotFoundException(); return this.leads.locked(r.actor, notice.leadId, tx => tx.noticeRead.upsert({ where: { noticeId_userId: { noticeId: id, userId: r.actor.id } }, create: { noticeId: id, userId: r.actor.id }, update: {} })); }
}
@Module({ imports: [AutoContactModule,AuthModule, LeadsModule, DevicesModule,ModelSettingsModule,AccountsModule], controllers: [CommentReviewController, CollectionController, NoticesController], providers: [ManualReviewService,AutoReviewService,ReviewPolicyService,ReviewEvaluationService,SinglePostService,CaptureService, QwenMatchingService, SemanticService, CollectionService, CollectionQueue, LoginRuntime, AccountReadService], exports: [AutoContactModule,CollectionService,AutoReviewService,ManualReviewService] })
export class CollectionModule {
}
