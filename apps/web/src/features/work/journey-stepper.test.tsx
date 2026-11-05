import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {it,expect} from 'vitest';
import {JourneyStepper} from './journey-stepper';
it('distinguishes selected view from execution state, text labels accompany every icon',()=>{
 const html=renderToStaticMarkup(<JourneyStepper selected="collect" onSelect={()=>{}} caption="自动回复 · 1 条结果未知 · 勿重发" attention details={['发送结果未知，请勿重发']} steps={[{id:'collect',label:'采集',state:'complete',status:'采集已结束'},{id:'review',label:'评论匹配',state:'complete',status:'匹配已完成'},{id:'contact',label:'自动回复',state:'unknown',status:'1 条结果未知'}]}/>);
 expect(html).toContain('data-state="unknown"');expect(html).toContain('aria-pressed="true"');expect(html).toContain('勿重发');expect(html).toContain('查看原因');expect(html).not.toContain('journey-conclusion');expect(html).toContain('aria-live="polite"');
});

it('keeps current actions in their own steps without a duplicate progress summary',()=>{
 const steps=[{id:'collect' as const,label:'采集',state:'complete' as const,status:'采集已结束'},{id:'review' as const,label:'评论匹配',state:'running' as const,status:'正在审核评论 · 已完成 1/3 批'},{id:'contact' as const,label:'自动回复',state:'queued' as const,status:'等待整轮评论审核结束'}];
 const html=renderToStaticMarkup(<JourneyStepper steps={steps} selected="review" onSelect={()=>{}} caption="duplicate-summary" attention={false}/>);
 expect(html).toContain('正在审核评论 · 已完成 1/3 批');expect(html).toContain('等待整轮评论审核结束');expect(html).toContain('journey-step-spinner');expect(html).not.toContain('duplicate-summary');expect(html).not.toContain('执行进展');expect(html).not.toContain('compact-status-notice');
});
it('preserves actionable notices even when a phase has not started',()=>{
 const html=renderToStaticMarkup(<JourneyStepper steps={[]} selected="collect" onSelect={()=>{}} caption="尚未开始" attention={false} details={['启动失败，请重试']}/>);
 expect(html).toContain('查看原因');
});

it('does not repeat a waiting state below its step',()=>{
 const html=renderToStaticMarkup(<JourneyStepper steps={[{id:'contact',label:'自动回复',state:'paused',status:'5 条待处理'}]} selected="contact" onSelect={()=>{}} caption="自动回复 · 5 条待处理" attention/>);
 expect(html).not.toContain('compact-status-notice');expect(html).toContain('5 条待处理');
});
