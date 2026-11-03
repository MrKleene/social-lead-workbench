import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,expect,it,vi} from 'vitest';
import {CommentReviewPage} from './comment-review-page';
const state=vi.hoisted(()=>({role:'ADMIN',overview:{} as any,error:false,pending:false,start:vi.fn()}));
vi.mock('@/features/auth/use-auth',()=>({useAuth:()=>({user:{role:state.role}})}));
vi.mock('./use-comment-review',()=>({useReviewOverview:()=>({data:state.overview,isPending:state.pending,isError:state.error,error:state.error?Error('虚构读取失败'):null,refetch:vi.fn()}),useLegacyReviewHistory:()=>({data:{items:[]}})}));
vi.mock('./use-manual-post',()=>({useManualPost:()=>({start:state.start})}));
vi.mock('./use-review-results',()=>({useReviewResults:()=>({total:{data:{total:5}},scored:{data:{total:3}}})}));
vi.mock('./review-results',()=>({ReviewResults:()=>null}));
vi.mock('./review-task-activity',()=>({ReviewTaskActivity:()=> 'TASK_ACTIVITY_SHOULD_NOT_BE_ON_RESULTS_PAGE'}));
vi.mock('./manual-post-panel',()=>({ManualPostPanel:()=>null}));
const html=()=>renderToStaticMarkup(<MemoryRouter><CommentReviewPage/></MemoryRouter>);
beforeEach(()=>{state.role='ADMIN';state.pending=false;state.error=false;state.start.mockClear();state.overview={policies:[{id:'p',autoEnabled:true}],connection:{state:'READY'},autoJobs:[]};});
it('review results have no duplicate settings but keep explicit secondary manual testing',()=>{const s=html();for(const text of ['识别设置','方案管理','自动联系与账号矩阵','查看采集原文'])expect(s).not.toContain(text);expect(s).toContain('手动测试');expect(s).toContain('data-variant="ghost"');expect(s).toContain('已评分');expect(state.start).not.toHaveBeenCalled();});
it('missing configuration and connection do not offer enabled manual execution',()=>{state.overview.policies=[];expect(html()).toContain('配置管理中添加评论匹配方案');expect(html()).toContain('disabled');state.overview.policies=[{id:'p'}];state.overview.connection.state='UNCONFIGURED';expect(html()).toContain('配置管理中完成模型配置');expect(html()).toContain('disabled');});
it('failed reads, loading and unauthorized roles do not render result actions',()=>{state.error=true;expect(html()).toContain('虚构读取失败');expect(html()).not.toContain('手动测试');state.error=false;state.pending=true;expect(html()).not.toContain('手动测试');state.role='SALES';expect(html()).toContain('由管理员管理');expect(html()).not.toContain('手动测试');});

it('keeps task-record activity off the results page',()=>{expect(html()).not.toContain('TASK_ACTIVITY_SHOULD_NOT_BE_ON_RESULTS_PAGE');});
