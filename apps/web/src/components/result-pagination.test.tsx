import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ResultPagination} from './result-pagination';
import {RadioGroup,RadioGroupItem} from './ui/radio-group';
const render=(total:number|undefined,offset=0,pending=false)=>renderToStaticMarkup(<ResultPagination total={total} offset={offset} pending={pending} onChange={vi.fn()}/>);
describe('shared result pagination',()=>{
 it('distinguishes empty, missing and populated totals',()=>{expect(render(0)).toContain('第 0/0 页');expect(render(undefined)).toContain('数量暂不可用');expect(render(41,40)).toContain('第 3/3 页');});
 it('disables navigation while fetching and at boundaries',()=>{expect(render(0).match(/disabled=""/g)).toHaveLength(2);expect(render(41,20,true).match(/disabled=""/g)).toHaveLength(2);expect(render(41,20)).not.toContain('disabled=""');expect(render(41,40).match(/disabled=""/g)).toHaveLength(1);});
 it('uses accessible navigation and the shadcn component',()=>{const html=render(1);expect(html).toContain('aria-label="结果分页"');expect(html).toContain('data-slot="pagination"');expect(html).toContain('aria-live="polite"');});
});
it('radio source choices expose one checked item and disabled choices',()=>{const s=renderToStaticMarkup(<RadioGroup value="a" aria-label="来源"><RadioGroupItem value="a" aria-label="第一条"/><RadioGroupItem value="b" disabled aria-label="不可用"/></RadioGroup>);expect(s).toContain('role="radiogroup"');expect(s.match(/aria-checked="true"/g)).toHaveLength(1);expect(s).toContain('data-slot="radio-group-item"');expect(s).toContain('disabled=""');});
