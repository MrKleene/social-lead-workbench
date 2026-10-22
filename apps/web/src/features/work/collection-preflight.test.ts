import {describe,it,expect} from 'vitest';
import {collectionPreflight} from './collection-preflight';
import type {Config,McpReadiness} from '../collection/types';
const config:Config={id:'fixture',name:'虚构',mode:'XHS_MCP',platform:'XHS',keywords:['护理'],excludeWords:[],batchLimit:1,enabled:true,revision:1,activeRunId:null,nextAllowedAt:null,pauseReason:null,runs:[]};
const readiness:McpReadiness={enabled:true,mode:'XHS_MCP',reason:'READY',lastCheck:null,coverage:'WINDOW_ONLY',automaticPolling:false,captureArchiveVersion:1,accountBound:true,device:{name:'虚构设备',online:true},accounts:[{id:'fixture',label:'虚构账号',eligible:true,platformUserId:null,reason:'VERIFIED'}]};
describe('采集与 LLM 独立的前置检查',()=>{
 it('没有配置仅补关键词；账号缺失仅补账号',()=>{expect(collectionPreflight(undefined,readiness)).toBe('keywords');expect(collectionPreflight(config,{...readiness,accounts:[]})).toBe('account');});
 it('不读取模型字段，LLM 与 Key 缺失仍可进入授权',()=>expect(collectionPreflight(config,readiness)).toBe('ready'));
 it('模式不匹配、设备离线和旧后台不放行',()=>{expect(collectionPreflight(config,{...readiness,mode:'XHS_FIXTURE'})).toBe('unavailable');expect(collectionPreflight(config,{...readiness,device:null})).toBe('device');expect(collectionPreflight(config,{...readiness,captureArchiveVersion:undefined})).toBe('unavailable');});
 it('禁用、退避、运行互斥不因页面改造解除',()=>{expect(collectionPreflight({...config,enabled:false},readiness)).toBe('paused');expect(collectionPreflight({...config,nextAllowedAt:new Date(Date.now()+10000).toISOString()},readiness)).toBe('backoff');expect(collectionPreflight({...config,activeRunId:'run'},readiness)).toBe('running');});
 it('真实账号不可用不能用另一个受限状态放行',()=>expect(collectionPreflight(config,{...readiness,accounts:readiness.accounts?.map(a=>({...a,eligible:false}))})).toBe('account'));
 it('明确模拟模式才免平台账号门槛',()=>expect(collectionPreflight({...config,mode:'MOCK'},{...readiness,accounts:[]})).toBe('ready'));
});
