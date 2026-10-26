import {Controller,Get,Put,Patch,Post,Param,Query,Req,Inject,UseGuards,Header} from '@nestjs/common';
import {z} from 'zod';
import {reviewAuthorizationSchema,reviewAutoToggleSchema,reviewPolicySaveSchema,reviewPolicyToggleSchema,reviewPrepareSchema,semanticEvaluateRequestSchema} from '@crm/contracts';
import {SessionGuard,AuthedRequest} from '../auth/auth';
import {parse} from '../common/validation';
import {ReviewPolicyService} from './review-policy.service';
import {ReviewEvaluationService} from './review-evaluation.service';
const offset=(v:unknown)=>parse(z.coerce.number().int().min(0).max(100000).default(0),v);
@Controller('comment-review')
@UseGuards(SessionGuard)
export class CommentReviewController {
 constructor(@Inject(ReviewPolicyService) private policies:ReviewPolicyService,@Inject(ReviewEvaluationService) private evaluation:ReviewEvaluationService){}
 @Get() @Header('Cache-Control','no-store') overview(@Req() r:AuthedRequest){return this.policies.overview(r.actor);}
 @Get('posts') posts(@Req() r:AuthedRequest,@Query('offset') n?:string){return this.policies.posts(r.actor,offset(n));}
 @Get('posts/:id/comments') comments(@Req() r:AuthedRequest,@Param('id') id:string,@Query('offset') n?:string){return this.policies.comments(r.actor,id,offset(n));}
 @Post('authorize') authorize(@Req() r:AuthedRequest){return this.policies.authorize(r.actor,parse(reviewAuthorizationSchema,r.body));}
 @Patch('policies/:id/automatic') automatic(@Req() r:AuthedRequest,@Param('id') id:string){return this.policies.automatic(r.actor,id,parse(reviewAutoToggleSchema,r.body));}
 @Get('history') history(@Req() r:AuthedRequest,@Query('offset') n?:string){return this.policies.results(r.actor,undefined,offset(n));}
 @Put('policies/:id') save(@Req() r:AuthedRequest,@Param('id') id:string){return this.policies.save(r.actor,id,parse(reviewPolicySaveSchema,r.body));}
 @Patch('policies/:id/control') toggle(@Req() r:AuthedRequest,@Param('id') id:string){return this.policies.toggle(r.actor,id,parse(reviewPolicyToggleSchema,r.body));}
 @Post('policies/:id/prepare') prepare(@Req() r:AuthedRequest,@Param('id') id:string){return this.policies.prepare(r.actor,id,parse(reviewPrepareSchema,r.body));}
 @Post('policies/:id/preview') preview(@Req() r:AuthedRequest,@Param('id') id:string){const b=parse(z.object({reviewIds:z.array(z.string().min(1)).min(1).max(5)}).strict(),r.body);return this.evaluation.preview(r.actor,id,b.reviewIds);}
 @Post('policies/:id/evaluate') evaluate(@Req() r:AuthedRequest,@Param('id') id:string){return this.evaluation.evaluate(r.actor,id,parse(semanticEvaluateRequestSchema,r.body));}
 @Get('policies/:id/results') results(@Req() r:AuthedRequest,@Param('id') id:string,@Query('offset') n?:string){return this.policies.results(r.actor,id,offset(n));}
}
