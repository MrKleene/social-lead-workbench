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
  for(const name of ['工作台','自动化任务','采集信息','评论审核','自动回复','待处理回复','回复记录','线索池','销售跟进','全部线索','人工任务','账号中心','发送模板','提醒与异常','关键词配置','评论匹配方案','配置管理','平台能力'])expect(html).toContain(name);
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

it('gives pending replies a distinct active destination and preserves the automatic-reply route',()=>{
 const html=render(true,'/auto-contact?view=pending');
 expect(html).toMatch(/<a(?=[^>]*href="\/auto-contact\?view=pending")(?=[^>]*aria-current="page")[^>]*>/);
 expect(html).toMatch(/href="\/auto-contact"[^>]*>/);
 expect(html.match(/aria-current="page"/g)).toHaveLength(1); // closed mobile dialog is not mounted
 expect(html).toContain('<span>待处理回复</span></div>'); // breadcrumb
 expect(render(false,'/auto-contact?view=pending')).not.toContain('待处理回复');
 const normal=render(true,'/auto-contact');
 expect(normal).toMatch(/<a(?=[^>]*href="\/auto-contact")(?=[^>]*aria-current="page")[^>]*>/);
 expect(normal).not.toMatch(/<a(?=[^>]*href="\/auto-contact\?view=pending")(?=[^>]*aria-current="page")[^>]*>/);
});

it('home is reached through desktop and mobile brand links, not a sidebar item',()=>{const html=render(true,'/home');expect(html.match(/aria-label="Social Lead 首页"/g)).toHaveLength(2);expect(html).not.toContain('<span>首页</span></a>');expect(html).not.toContain('项目概览');expect(html).toContain('<span>首页</span></div>');expect(render(true,'/work')).toMatch(/<a(?=[^>]*href="\/work")(?=[^>]*aria-current="page")[^>]*>/);});


it('groups the three existing configuration destinations without duplicate legacy labels',()=>{
 const html=render(true,'/comment-review?manage=1');
 for(const label of ['关键词配置','评论匹配方案','发送模板'])expect(html).toContain(label);
 expect(html).toContain('<h2>配置管理</h2>');
 expect(html).not.toContain('搜索与模型');expect(html).not.toContain('联系与回复话术');
 expect(html).toMatch(/<a(?=[^>]*href="\/comment-review\?manage=1")(?=[^>]*aria-current="page")[^>]*>/);
 expect(html).not.toMatch(/<a(?=[^>]*href="\/comment-review")(?=[^>]*aria-current="page")[^>]*>/);
 expect(html).toContain('<span>配置管理</span><span aria-hidden="true">/</span><span>评论匹配方案</span>');
 const sales=render(false,'/comment-review?manage=1');
 for(const label of ['配置管理','关键词配置','评论匹配方案','发送模板'])expect(sales).not.toContain(label);
});
