import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {it,expect} from 'vitest';
import {JourneyStepper} from './journey-stepper';
it('distinguishes selected view from execution state, text labels accompany every icon',()=>{
 const html=renderToStaticMarkup(<JourneyStepper selected="collect" onSelect={()=>{}} caption="自动回复 · 1 条结果未知 · 勿重发" attention details={['发送结果未知，请勿重发']} steps={[{id:'collect',label:'采集',state:'complete',status:'采集已结束'},{id:'review',label:'评论匹配',state:'complete',status:'匹配已完成'},{id:'contact',label:'自动回复',state:'unknown',status:'1 条结果未知'}]}/>);
 expect(html).toContain('data-state="unknown"');expect(html).toContain('aria-pressed="true"');expect(html).toContain('勿重发');expect(html).toContain('查看原因');expect(html).not.toContain('journey-conclusion');expect(html).toContain('aria-live="polite"');
});
