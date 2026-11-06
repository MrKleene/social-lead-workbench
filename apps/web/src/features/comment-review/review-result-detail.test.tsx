import {manualReviewLabel} from './manual-review-label';
import {MemoryRouter} from 'react-router-dom';
import {createElement,type ReactNode} from 'react';
import {TooltipProvider} from '@/components/ui/tooltip';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {ReviewJobSummary} from './review-task-activity';
import type {ManualReviewTask,SemanticReviewItem} from '@crm/contracts';
import {ReviewResultsTable,ReviewResultEvidence} from './review-result-detail';
vi.mock('@/components/disclosure',async importOriginal=>{const actual=await importOriginal<typeof import('@/components/disclosure')>();return {Disclosure:(props:Parameters<typeof actual.Disclosure>[0])=>createElement(actual.Disclosure,{...props,defaultOpen:true})};});
const item:SemanticReviewItem={id:'synthetic-review',revision:3,version:2,state:'EVALUATED',reviewStatus:'PENDING',score:24,reason:'有内容但不符合服务范围',context:'SUFFICIENT',result:{id:'synthetic-comment',score:24,decision:'NO_MATCH',reason:'有内容但不符合服务范围',context:'SUFFICIENT',evidence:[{source:'COMMENT',quote:'仅查看内容'}]},snapshot:{postId:'synthetic-post',commentId:'synthetic-comment',userId:'synthetic-user',title:'示例来源帖子',body:'已保存的帖子正文',comment:'仅查看内容',parentId:'parent',parent:'示例父评论',coverage:'COMPLETE',isDemo:true},rules:{version:1,target:'识别明确的服务需求',reviewThreshold:75},provider:'example',modelVersion:'test-model-v1',isDemo:true,createdAt:'2026-11-01T01:00:00Z',reviewNote:null,eligibility:{canSend:false,blockers:['示例不可发送']}};
const render=(child:ReactNode)=>renderToStaticMarkup(createElement(MemoryRouter,{children:createElement(TooltipProvider,{children:child})}));
const table=(items:SemanticReviewItem[])=>render(createElement(ReviewResultsTable,{items,onOpen:()=>{},canReview:true}));
describe('standalone review presentation',()=>{
 it('keeps low scores and separates model completion from manual pending',()=>{const html=table([item]);for(const s of ['<table','相关度','24','已评估','合成样本'])expect(html).toContain(s);expect(html.match(/data-slot="table-head"/g)).toHaveLength(5);expect(html).not.toContain('已人工确认');expect(html).not.toContain('自动发送');expect(html).not.toContain('待审核');expect(html).not.toContain('人工状态');});
 it('does not render a stale score on failed, processing or unanalysed results',()=>{for(const state of ['FAILED','PROCESSING','UNANALYSED']){const html=table([{...item,state,score:92}]);expect(html).toContain('未评分');expect(html).not.toContain('>92<');}expect(table([{...item,state:'FAILED',displayReason:'示例模型请求失败'}])).toContain('示例模型请求失败');});
 it('keeps manual decisions explicit without changing model status',()=>{const html=table([{...item,reviewStatus:'REJECTED'},{...item,id:'second',reviewStatus:'APPROVED'}]);expect(html).toContain('已人工排除');expect(html).not.toContain('已人工确认');expect(html).toContain('已评估');});
 it('retains full comment data and source fallback without invented task or nickname',()=>{const long='长评论内容'.repeat(120);const html=table([{...item,snapshot:{...item.snapshot,title:'',comment:long}}]);expect(html).toContain(long.slice(0,240));expect(html).toContain('展开原文');expect(html).toContain('来源帖子标题缺失');expect(html).not.toContain('<img');expect(html).not.toContain('自动化 ·');});
 it('retains source evidence, reasons, versions and context in details',()=>{const html=render(createElement(ReviewResultEvidence,{item}));for(const text of ['有内容但不符合服务范围','模型判断不相关','分数不是准确率','仅查看内容','test-model-v1','已保存的帖子正文','示例父评论','历史输入：未记录当前观察版本','沿用当时保存的快照'])expect(html).toContain(text);});
 it('shows absent evidence honestly rather than claiming a model judgement',()=>{const html=render(createElement(ReviewResultEvidence,{item:{...item,state:'UNANALYSED',score:null,reason:null,result:null}}));expect(html).toContain('尚未获得模型判断');expect(html).toContain('没有模型原文引用证据');expect(html).not.toContain('模型判断相关');});
});

describe('review job progress presentation',()=>{
 it('does not turn completed job status into an all-scored claim',()=>{const job:ManualReviewTask={id:'fictional-job',postId:'fictional-post',title:'虚构作业',coverage:'COMPLETE',policyRevision:2,model:'示例模型',modelVersion:1,priceVersion:'test',scopeHash:'synthetic',status:'COMPLETED',reason:null,total:8,pending:1,success:4,failed:2,skipped:1,maxCalls:1,retrying:0,capacityError:null,target:'虚构需求',dailyLimit:10,authorized:true};const html=render(createElement(ReviewJobSummary,{job}));for(const text of ['处理结束','已评分','未获评分','未重复发送','需重新选择帖子并确认后才会再次调用','虚构需求','示例模型'])expect(html).toContain(text);expect(html).toContain('role="progressbar"');expect(html).toContain('aria-valuenow="50"');expect(html).toContain('aria-valuetext="4 / 8 条"');expect(html).not.toContain('全部成功');expect(html).not.toContain('自动重试');});
});

describe('saved publication and source metadata',()=>{
 it('shows actual saved author and publication separately from review time',()=>{const html=table([{...item,source:{authorNickname:'虚构作者',publishedAt:'2026-10-03T00:30:00.000Z',configId:'fixture-config',platformPostId:'fixture-post'}}]);expect(html).toContain('虚构作者');expect(html).toContain('评论发布');expect(html).toContain('2026/10/03');expect(html).toContain('北京时间');expect(html).toContain('module=archive');expect(html).not.toContain('11/01');});
 it('does not use review timestamp for missing publication and rejects unsafe media',()=>{const html=table([{...item,source:{authorAvatarUrl:'file:///private/secret',coverUrl:'javascript:bad'}}]);expect(html).toContain('评论发布时间未知');expect(html).toContain('用户名称未保存');expect(html).not.toContain('file:///');expect(html).not.toContain('javascript:');expect(html).toContain('封面未保存或不可用');});
 it('keeps parent context and complete long comment in details',()=>{const html=render(createElement(ReviewResultEvidence,{item}));expect(html).toContain('回复父评论');expect(html).toContain('示例父评论');expect(html).toContain('审核记录时间');});
});

it('uses neutral manual labels without changing model pending labels',()=>{expect(manualReviewLabel('PENDING')).toBe('未人工复核');expect(manualReviewLabel('APPROVED')).toBe('已人工确认');expect(manualReviewLabel('REJECTED')).toBe('已人工排除');});

it('removes detail/evidence actions while preserving an explicit review menu for admins',()=>{const html=table([item]);expect(html).toContain('评论更多操作 1');expect(html).not.toContain('查看详情');expect(html).not.toContain('评分依据');const readonly=render(createElement(ReviewResultsTable,{items:[item],onOpen:()=>{},canReview:false}));expect(readonly).not.toContain('评论更多操作');});
