import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {TooltipProvider} from '@/components/ui/tooltip';
import {CollectionPostCard} from './collection-post-card';
import type {InfoPost} from './collection-info-model';
const post={id:'fictional-post',title:'示例归档帖子',lastSeenAt:'2026-11-01T09:00:00Z',versions:[],comments:[]} as InfoPost;
function render(value:InfoPost){return renderToStaticMarkup(<TooltipProvider><table><tbody><CollectionPostCard post={value} platform="XHS" onOpen={()=>{}}/></tbody></table></TooltipProvider>);}
describe('archive table shows saved evidence without inferring completeness',()=>{
 it('keeps a keyboard button to open the exact saved post and shows unknown coverage',()=>{const html=render(post);expect(html).toContain('data-post="fictional-post"');expect(html).toContain('查看示例归档帖子原文');expect(html).toContain('本页已采集');expect(html).toContain('昵称未采集');expect(html).not.toContain('已读完');});
 it('does not invent a platform count when no declaration exists',()=>{const html=render(post);expect(html).not.toContain('平台声明');expect(html).toContain('0</span>');});
});
