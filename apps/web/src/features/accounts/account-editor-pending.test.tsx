import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const state=vi.hoisted(()=>({query:{isPending:false,isError:false,data:[],refetch:vi.fn()}}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>state.query}));
vi.mock('@/features/work/draft-guard',()=>({useDraftGuard:()=>{}}));
import {AccountEditor} from './account-editor';
describe('account editor pending state',()=>{
 it('locks editable fields while a save is in flight',()=>{const html=renderToStaticMarkup(<AccountEditor pending onSave={()=>{}}/>);expect(html).toContain('aria-busy="true"');const inputs=html.match(/<input[^>]+>/g)||[];expect(inputs.length).toBe(2);for(const input of inputs)expect(input).toContain('disabled=""');expect(html).toContain('保存中…');});
 it('explains owner loading and blocks saving an incomplete owner selection',()=>{state.query.isPending=true;const html=renderToStaticMarkup(<AccountEditor pending={false} onSave={()=>{}}/>);expect(html).toContain('正在读取负责人');expect(html).toMatch(/<button[^>]*disabled=""[^>]*>保存账号设置/);state.query.isPending=false;});
});
