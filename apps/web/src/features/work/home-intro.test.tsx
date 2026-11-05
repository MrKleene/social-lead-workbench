import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {describe,it,expect} from 'vitest';
import {OrbitOverview} from './orbit-overview';
const render=(admin:boolean,path='/home')=>renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><OrbitOverview admin={admin}/></MemoryRouter>);
describe('project introduction homepage',()=>{
 it('renders without business-data providers and keeps configuration and execution on work pages',()=>{
  const html=render(true);
  expect(html).toContain('AI 辅助获客工作台');
  expect(html).not.toContain('进入工作台');
  expect(html).not.toContain('href="/automation"'); // Controls are supplied separately, not embedded in introduction content.
  expect(html).toContain('按需开启 AI 语义匹配');
  expect(html).toContain('授权与额度允许');
  expect(html).toContain('接收消息与平台会话');expect(html).not.toContain('销售跟进');
  expect(html).not.toMatch(/最近任务|三步配置|<input|<button|role="switch"/);
 });
 it('does not offer admin automation to sales users',()=>{
  const html=render(false);
  expect(html).not.toContain('进入工作台');
  expect(html).not.toContain('href="/automation"');
 });
 it('keeps the introduction visible with legacy workspace parameters',()=>{
  const html=render(true,'/home?module=accounts&view=follow');
  expect(html).toContain('id="home-title"');
  expect(html).not.toMatch(/inert|data-workspace-inactive/);
 });
});

it('places only supplied launch controls in the introduction, with no dashboard statistics',()=>{const html=renderToStaticMarkup(<OrbitOverview admin actions={<><button>开始采集</button><button>采集设置</button></>}/>);expect(html.match(/<button/g)).toHaveLength(2);expect(html).toContain('开始采集');expect(html).toContain('采集设置');expect(html).not.toMatch(/最近任务|今日发送|运营数据/);});
