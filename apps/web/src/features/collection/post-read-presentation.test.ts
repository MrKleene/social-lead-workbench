import {it,expect} from 'vitest';
import {postReadPresentation,type PostReadEvidence} from './post-read-presentation';
import {unknownPostAvailability} from '@crm/contracts';
const e:PostReadEvidence={runId:'run',scope:'LATEST',observedAt:'2026-11-01T17:59:09Z',accessObserved:true,coverage:'COMPLETE',confirmedComments:33,declaredComments:33,reason:'VERIFIED_RUN_SCOPE'};
it('shows collected access and exact run count independently of old stock',()=>{expect(postReadPresentation(e,unknownPostAvailability)).toMatchObject({access:'采集时可访问',coverage:'本轮可见评论已读完 · 33 条',scope:'最近读取'});});
it.each(['UNAVAILABLE','CONFIRMED_DELETED','UNKNOWN'])('does not replace explicit %s risk with collection success',state=>{for(const time of ['2026-11-01T18:00:00Z','2026-11-01T16:00:00Z'])expect(postReadPresentation(e,{...unknownPostAvailability,state,reason:state==='CONFIRMED_DELETED'?'MANUAL_DELETED':'NO_RESULT',version:1,checkedAt:time}).captured).toBe(false);});
it('prefers newer independent normal check and distinguishes historical unknown membership',()=>{expect(postReadPresentation(e,{...unknownPostAvailability,state:'NORMAL',reason:'EXACT_VISIBLE',version:2,checkedAt:'2026-11-01T18:00:00Z'}).captured).toBe(false);expect(postReadPresentation({...e,scope:'RUN',coverage:'UNKNOWN',reason:'HISTORICAL_MEMBERS_UNAVAILABLE'})).toMatchObject({scope:'所选轮次',coverage:'本轮覆盖证据不足'});});
