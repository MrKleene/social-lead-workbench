import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RunStats} from './run-stats';
import {it,expect} from 'vitest';
import {runSummary} from './run-stats';
import type {Run} from './types';
const base={id:'r',status:'PARTIAL',observed:42,matched:0,added:0,notices:0,requests:27} as Run;
it('历史计数不能伪造成帖子数或新增分类',()=>{expect(runSummary(base)).toContain('42 条评论/回复');expect(runSummary(base)).toContain('历史帖子数');expect(runSummary(base)).not.toContain('42 篇');});
it('新窗口区分帖子、顶层评论、回复和三类结果',()=>{const text=runSummary({...base,metrics:{version:1,policy:'INDEPENDENT_V1',postsRead:3,rootComments:30,replies:12,highRelevant:4,needsReview:5,unmatched:33,legacyMatches:0,filterReasons:{NO_SIGNAL:33}}});for(const word of ['3 篇帖子','30 条顶层评论','12 条回复','高相关 4','待核查 5','不匹配 33'])expect(text).toContain(word);});

it('失败丢弃窗口时不伪造零读取',()=>expect(runSummary({...base,metrics:{version:1,discarded:true} as Run['metrics']})).toContain('不能视为零读取'));

it('only schema-checked diagnostic fields are rendered',()=>{const metrics={version:1,policy:'LEGACY',postsRead:0,rootComments:0,replies:0,highRelevant:0,needsReview:0,unmatched:0,legacyMatches:0,filterReasons:{},diagnostic:{version:1,stage:'post',kind:'SCHEMA_VALIDATION',field:'userInfo',postOrdinal:2,requestStep:17}};const markup=renderToStaticMarkup(createElement(RunStats,{run:{...base,metrics:metrics as Run['metrics']}}));expect(markup).toContain('SCHEMA_VALIDATION');expect(markup).toContain('第 2 篇');const unsafe=renderToStaticMarkup(createElement(RunStats,{run:{...base,metrics:{...metrics,diagnostic:{...metrics.diagnostic,raw:'FAKE_SECRET'}} as Run['metrics']}}));expect(unsafe).not.toContain('FAKE_SECRET');expect(unsafe).not.toContain('安全诊断');});
