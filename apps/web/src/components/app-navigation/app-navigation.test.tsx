import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {AppNavigation} from './app-navigation';
import type {useWorkspaceMotion} from '@/features/work/use-workspace-motion';

const motion={reduced:false,toggle:vi.fn()} as unknown as ReturnType<typeof useWorkspaceMotion>;
const render=(admin:boolean,path='/home')=>renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><AppNavigation admin={admin} name="虚构用户" motion={motion} loggingOut={false} onLogout={vi.fn()}/></MemoryRouter>);
describe('graphite navigation preserves authorized destinations',()=>{
 it('keeps all administrator modules reachable and marks the current route',()=>{
  const html=render(true,'/automation?config=example&run=example-run');
  for(const name of ['首页','项目概览','自动化任务','采集信息','评论审核','自动回复','回复记录','线索池','销售跟进','全部线索','人工任务','账号中心','联系与回复话术','提醒与异常','搜索与模型','平台能力'])expect(html).toContain(name);
  expect(html).toContain('href="/automation?config=example&amp;run=example-run"');
  expect(html).toContain('aria-current="page"');
  expect(html).toContain('aria-label="打开导航"');
 });
 it('does not expose administrator execution or settings links to sales',()=>{
  const html=render(false,'/work?module=follow&view=follow');
  for(const route of ['/automation','/comment-review','/auto-contact','/reply-history','module=settings','module=templates','module=archive'])expect(html).not.toContain(`href="${route}`);
  for(const label of ['销售跟进','全部线索','人工任务','提醒与异常'])expect(html).toContain(label);
  expect(html).toContain('aria-current="page"');
 });
});
