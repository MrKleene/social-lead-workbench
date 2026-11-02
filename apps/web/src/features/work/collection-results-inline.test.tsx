import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
import {CollectionProgressFeed} from './collection-progress-feed';
import type {Run} from '@/features/collection/types';
const fixture=vi.hoisted(()=>({items:[{platformPostId:'fictional-post',title:'虚构帖子标题',body:'虚构正文',savedCount:3,rootCount:2,replyCount:1,newCount:1,reusedCount:2,savedAt:'2026-11-02T00:00:00Z',stopReason:null}],isPending:false,isError:false,availability:'AVAILABLE'}));
vi.mock('./use-run-post-feed',()=>({useRunPostFeed:()=>({data:{items:fixture.items,availability:fixture.availability},isPending:fixture.isPending,isError:fixture.isError,refetch:vi.fn()}),useRunPostSnapshot:()=>({configId:'config-fixture',runId:'run-fixture',items:fixture.items,availability:fixture.availability,limited:false})}));
const run={id:'run-fixture',status:'COMPLETE',reason:null,capturedPosts:1,capturedCommentsCount:3,createdAt:'2026-11-01T23:59:00Z',finishedAt:'2026-11-02T00:01:00Z',readPlan:{rounds:1,postsPerRound:3,commentPages:20}} as Run;
const render=(options:{run?:Run;pending?:boolean;error?:unknown}={})=>renderToStaticMarkup(<CollectionProgressFeed configId="config-fixture" run={run} pending={false} error={null} visible onRefresh={vi.fn()} {...options}/>);
beforeEach(()=>{fixture.isPending=false;fixture.isError=false;fixture.availability='AVAILABLE';});
it('shows facts inline and post data without separate detail, refresh or view actions',()=>{
 const html=render();for(const text of ['评论 / 回复','主评论 2','回复 1','采集时间（北京）','虚构帖子标题','新存 / 复用原文','开始时间（北京）','覆盖待确认'])expect(html).toContain(text);
 for(const text of ['覆盖与读取明细','采集详情','刷新帖子','>查看<','已采集当前可见评论'])expect(html).not.toContain(text);
 expect(html).toMatch(/<button[^>]*>虚构帖子标题<\/button>/);expect(html).toContain('2026/11/02 08:00');
});
it('keeps a failed read retry and known interruption visible',()=>{
 fixture.isError=true;const html=render({run:{...run,status:'FAILED',reason:'LOGIN_EXPIRED'}});expect(html).toContain('帖子明细读取失败');expect(html).toContain('重试');expect(html).toContain('采集失败');expect(html).not.toContain('刷新帖子');
});
it('loading and missing run do not show stale saved rows or extra controls',()=>{
 expect(render({pending:true})).toContain('正在获取任务记录');expect(render({pending:true})).not.toContain('虚构帖子标题');expect(render({run:undefined})).toContain('开始后，采集结果会显示在这里');expect(render({error:Error('fixture')})).toContain('重试读取');
});
it('running keeps progress visible and unknown coverage distinct from success',()=>{
 const html=render({run:{...run,status:'RUNNING',finishedAt:null}});expect(html).toContain('读取中');expect(html).toContain('覆盖待确认');expect(html).not.toContain('结束时间（北京）');
});
it('old run without retained snapshot remains explicit and does not show another run posts',()=>{
 fixture.availability='SUPERSEDED';const html=render();expect(html).toContain('旧任务未保留完整的逐篇快照');expect(html).not.toContain('虚构帖子标题');
});
