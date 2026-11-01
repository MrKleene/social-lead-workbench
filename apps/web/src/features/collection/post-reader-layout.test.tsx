import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TooltipProvider} from '@/components/ui/tooltip';
import {Button} from '@/components/ui/button';
import {CollectionPostDetail} from './collection-post-detail';
import {PostStateEvidence} from './post-availability';
import {unknownPostAvailability} from '@crm/contracts';
import type {InfoPost} from './collection-info-model';
const post={id:'000000000000000000000001',title:'虚构原帖',lastSeenAt:'2026-11-01T09:00:00Z',comments:[],versions:[{id:'saved',sourceAvailable:true,savedComments:0,snapshot:{body:'原帖正文'},lastSeenAt:'2026-11-01T09:00:00Z'}]} as unknown as InfoPost;
const wrap=(node:React.ReactNode)=><QueryClientProvider client={new QueryClient()}><TooltipProvider>{node}</TooltipProvider></QueryClientProvider>;
describe('post reader action and evidence hierarchy',()=>{
 it('keeps post actions together outside original content and retains readonly unknown evidence',()=>{
  const html=renderToStaticMarkup(wrap(<CollectionPostDetail configId="fixture" id="000000000000000000000001" post={post} platform="XHS" readAction={<Button disabled>重新读取此帖</Button>} onBack={()=>{}} onRefresh={()=>{}}/>));
  const toolbar=html.slice(html.indexOf('aria-label="帖子操作"'),html.indexOf('class="info-detail-grid"'));
  for(const label of ['状态与证据','来源与证据','刷新','重新读取此帖','查看原文'])expect(toolbar).toContain(label);
  const story=html.slice(html.indexOf('<aside'),html.indexOf('</aside>'));
  expect(story).toContain('虚构原帖');expect(story).toContain('访问状态未知');expect(story).toContain('覆盖待确认');
  for(const label of ['状态与证据','重新读取此帖','查看原文'])expect(story).not.toContain(label);
 });
 it('keeps reason, source, observation time, version and long evidence in labeled rows',()=>{
  const html=renderToStaticMarkup(wrap(<PostStateEvidence value={{...unknownPostAvailability,evidence:{note:'虚构长证据\n不可据此改判'}}}/>));
  for(const label of ['最近状态','检查时间','从未检查','原因','来源','无证据来源','证据版本','记录内容','不可据此改判'])expect(html).toContain(label);
  expect(html).toContain('<dl');expect(html).toContain('访问状态未知');
 });
});
