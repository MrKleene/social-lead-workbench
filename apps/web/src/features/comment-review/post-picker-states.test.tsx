import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {SavedPostList} from './post-picker';
const render=(query:object)=>renderToStaticMarkup(createElement(SavedPostList,{state:{search:'',offset:0,setSearch:vi.fn(),setOffset:vi.fn(),query} as never,onSelect:vi.fn()}));
describe('saved post picker read states',()=>{
 it('offers retry on errors without claiming no saved posts',()=>{const html=render({isError:true,error:Error('读取失败')});expect(html).toContain('读取失败');expect(html).toContain('重新加载帖子');expect(html).not.toContain('没有符合条件');});
 it('announces empty results separately from loading',()=>{const empty=render({data:{items:[],hasMore:false}});expect(empty).toContain('没有符合条件的已保存帖子');expect(empty).toContain('role="status"');const loading=render({isPending:true});expect(loading).toContain('加载中');expect(loading).not.toContain('没有符合条件');});
});
