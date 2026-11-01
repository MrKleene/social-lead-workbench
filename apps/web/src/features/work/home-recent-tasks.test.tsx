import React from 'react';
import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {HomeRecentTasks} from './home-recent-tasks';
import type {Config} from '@/features/collection/types';
const run={id:'run/1',scenario:'BASELINE',status:'PARTIAL',reason:'LOGIN_EXPIRED',requests:1,observed:3,matched:0,added:0,notices:0,createdAt:'2026-11-01T10:00:00Z',finishedAt:'2026-11-01T10:01:00Z',capturedPosts:1,capturedCommentsCount:3};
const config:Config={id:'config&1',name:'虚构关键词组',platform:'XHS',mode:'XHS_MCP',keywords:['虚构'],excludeWords:[],batchLimit:1,enabled:true,revision:1,activeRunId:null,nextAllowedAt:null,pauseReason:null,runs:[run]};
function render(data?:Config[],error=false){const q=new QueryClient({defaultOptions:{queries:{retry:false}}});if(data)q.setQueryData(['collection','dashboard'],data);if(error)q.getQueryCache().build(q,{queryKey:['collection','dashboard']}).setState({status:'error',error:new Error('读取失败'),fetchStatus:'idle'});return renderToStaticMarkup(<QueryClientProvider client={q}><MemoryRouter><HomeRecentTasks/></MemoryRouter></QueryClientProvider>);}
it('keeps the section and real loading state before history arrives',()=>{const html=render();expect(html).toContain('最近任务');expect(html).toContain('正在读取任务');expect(html).not.toContain('暂无采集任务');});
it('distinguishes empty from failed reads and offers retry',()=>{expect(render([])).toContain('暂无采集任务');const html=render([],true);expect(html).toContain('重新读取任务');expect(html).toContain('读取失败');expect(html).not.toContain('暂无采集任务');});
it('renders saved counts, incomplete status and scoped navigation without execution controls',()=>{const html=render([config]);expect(html).toContain('虚构关键词组');expect(html).toContain('采集已停止');expect(html).toContain('1 篇帖子 · 3 条评论/回复');for(const stage of ['collect','review','contact'])expect(html).toContain(`config=config%261&amp;run=run%2F1&amp;stage=${stage}`);expect(html).not.toContain('全部完成');expect(html).not.toContain('开始采集');});
it('keeps recent tasks bounded and labels simulation',()=>{const html=render([{...config,mode:'MOCK',runs:Array.from({length:8},(_,i)=>({...run,id:'run'+i,createdAt:new Date(1000+i).toISOString()}))}]);expect(html.match(/class="home-task-row"/g)).toHaveLength(3);expect(html).toContain('模拟');expect(html).toContain('run=run7');expect(html).not.toContain('run=run0');});

it('keeps an older running task visible before newer history',()=>{const html=render([{...config,runs:[...Array.from({length:4},(_,i)=>({...run,id:'ended'+i,createdAt:new Date(5000+i).toISOString()})),{...run,id:'active',status:'RUNNING',createdAt:new Date(1000).toISOString()}]}]);expect(html).toContain('run=active');expect(html.indexOf('run=active')).toBeLessThan(html.indexOf('run=ended3'));});
