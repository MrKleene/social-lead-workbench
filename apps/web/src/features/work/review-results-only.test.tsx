import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {expect,it,vi} from 'vitest';
import {TaskWorkspace} from './task-workspace';
import type {Config} from '@/features/collection/types';
const state=vi.hoisted(()=>({historical:false,reviewProps:{} as Record<string,unknown>}));
vi.mock('@tanstack/react-query',async importOriginal=>({...await importOriginal<object>(),useQuery:()=>({data:undefined,isPending:false,isError:false})}));
vi.mock('./settings-data',()=>({useAutomationPreferences:()=>({data:{policyId:'policy-a'}})}));
vi.mock('@/features/collection/use-collection',()=>({useConfig:()=>({data:undefined,isPending:false})}));
vi.mock('@/features/comment-review/use-comment-review',()=>({useReviewOverview:()=>({data:{policies:[{id:'policy-a',revision:3,autoEnabled:true}]},isPending:false})}));
vi.mock('./use-run-history',async importOriginal=>({...await importOriginal<object>(),useRunHistory:()=>({data:{current:{id:'current-run'},selected:{id:state.historical?'old-run':'current-run',status:'COMPLETE',createdAt:'2026-11-01T00:00:00Z',capturedCommentsCount:33},items:[],activePhase:null,selectedMissing:false},isPending:false})}));
vi.mock('./workspace-automation',()=>({useWorkspaceAutomation:()=>({openSettings:vi.fn()})}));
vi.mock('./collection-flow',()=>({CollectionFlow:()=>null}));
vi.mock('./run-history-dialog',()=>({RunHistoryDialog:()=>null}));
vi.mock('@/features/auto-contact/auto-contact-page',()=>({AutoContactPage:()=>null}));
vi.mock('@/features/comment-review/run-review-panel',()=>({RunReviewPanel:(props:Record<string,unknown>)=>{state.reviewProps=props;return <div>本轮帖子与评论结果</div>;}}));
const config={id:'config-a',runs:[]} as unknown as Config;
const render=()=>renderToStaticMarkup(<MemoryRouter initialEntries={[`/automation?config=config-a&run=${state.historical?'old-run':'current-run'}&stage=review&reviewVersion=999`]}><TaskWorkspace configs={[config]} initialId={config.id} loading={false} visible onSelect={vi.fn()} onAccounts={vi.fn()} onSettings={vi.fn()} onResults={vi.fn()}/></MemoryRouter>);
it('current task ignores obsolete version links and shows results without a version selector',()=>{
 state.historical=false;const html=render();expect(html).toContain('本轮帖子与评论结果');expect(html).not.toContain('审核目标版本');expect(html).not.toContain('全部历史版本');expect(state.reviewProps.runId).toBe('current-run');expect(state.reviewProps.policyId).toBe('policy-a');expect(state.reviewProps).not.toHaveProperty('policyRevision');
});
it('historical task retains its run scope and read-only result view despite obsolete version links',()=>{
 state.historical=true;const html=render();expect(html).toContain('历史任务');expect(html).toContain('本轮帖子与评论结果');expect(state.reviewProps.runId).toBe('old-run');expect(state.reviewProps.policyId).toBeUndefined();expect(state.reviewProps.onSettings).toBeUndefined();expect(state.reviewProps).not.toHaveProperty('policyRevision');
});
