import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {expect,it,vi} from 'vitest';
import {ReviewFilterToolbar} from './review-filter-toolbar';
import {reviewDefaults} from './review-scope';
vi.mock('./post-picker',()=>({useSavedPosts:()=>({}),SavedPostList:()=>null}));
function html(changes:Record<string,string>={},scoped=false){const defaults=reviewDefaults(scoped),s:any={filters:{...defaults,...changes},defaults,change:vi.fn(),changeMany:vi.fn(),reset:vi.fn()};return renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ReviewFilterToolbar state={s} post={null} onPostChange={()=>{}}/></MemoryRouter></QueryClientProvider>);}
it('keeps search, state, sorting and filter dialog in a compact toolbar without date fields',()=>{const s=html();expect(s).toContain('搜索评论');expect(s).toContain('评估状态');expect(s).toContain('结果排序');expect(s).toContain('aria-haspopup="dialog"');expect(s).not.toContain('type="date"');expect(s).not.toContain('清除筛选');expect(s).not.toContain('任务记录');});
it('exposes selected constraints and individually named removal controls',()=>{const s=html({search:'虚构关键词',minScore:'0',maxScore:'95',from:'2026-11-01',to:'2026-11-03',status:'REJECTED',publication:'known',state:'FAILED'});for(const t of ['已选筛选条件','移除搜索：虚构关键词','移除相关度：0–95','移除评论时间','移除已人工排除','移除失败或中断','清除筛选'])expect(s).toContain(t);});
it('respects current-task all-state defaults and never turns unknown time into a date',()=>{expect(html({},true)).not.toContain('清除筛选');const s=html({publication:'unknown'});expect(s).toContain('移除时间未知');expect(s).not.toContain('评论时间：');});
