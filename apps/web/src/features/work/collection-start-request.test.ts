import {describe,it,expect} from 'vitest';
import type {Config,McpReadiness} from '@/features/collection/types';
import {collectionStartRequest,sameCollectionSetup} from './collection-start-request';
const config:Config={id:'fictional-config',name:'虚构关键词组',mode:'XHS_MCP',platform:'XHS',keywords:['虚构关键词'],excludeWords:[],batchLimit:2,defaultExecutionAccountId:'saved-account',revision:2,enabled:true,activeRunId:null,nextAllowedAt:null,pauseReason:null,runs:[]};
const readiness:McpReadiness={enabled:true,mode:'XHS_MCP',accountBound:true,captureArchiveVersion:1,reason:'READY',lastCheck:null,coverage:'WINDOW_ONLY',automaticPolling:false,device:{name:'虚构设备',online:true},accounts:[{id:'other-account',label:'另一账号',platformUserId:null,eligible:true,reason:'VERIFIED'},{id:'saved-account',label:'已保存账号',platformUserId:null,eligible:true,reason:'PREVIOUSLY_VERIFIED'}]};
describe('explicit one-click collection scope',()=>{
 it('uses only the saved account and count with one-run consent, never authorizes other stages',()=>{
  expect(collectionStartRequest(config,readiness,'same-key')).toEqual({path:'/collection/configs/fictional-config/runs',body:{mode:'XHS_MCP',scenario:'READ_WINDOW',requestKey:'same-key',accountId:'saved-account',consent:'account-read-window-v1',readPlan:{rounds:1,postsPerRound:2,commentPages:1}}});
 });
 it.each([null,'missing-account'])('does not substitute another account when the default is %s',id=>expect(collectionStartRequest({...config,defaultExecutionAccountId:id},readiness,'key')).toBeNull());
 it('does not substitute an eligible account for the blocked saved account',()=>expect(collectionStartRequest(config,{...readiness,accounts:readiness.accounts?.map(a=>({...a,eligible:a.id!=='saved-account'}))},'key')).toBeNull());
 it.each(['UNVERIFIED','PREVIOUSLY_VERIFIED','CONNECTION_ERROR'])('leaves allowed %s evidence to the existing task-start verification',reason=>expect(collectionStartRequest(config,{...readiness,accounts:readiness.accounts?.map(a=>({...a,reason}))},'key')?.body.accountId).toBe('saved-account'));
 it.each(['EXPIRED','MISSING','NEEDS_REVIEW','RESTRICTED','CHECKING'])('blocks %s when readiness disallows execution',reason=>expect(collectionStartRequest(config,{...readiness,accounts:readiness.accounts?.map(a=>({...a,reason,eligible:false}))},'key')).toBeNull());
 it('retains running, pause, backoff, mode and device gates',()=>{
  for(const c of [{...config,activeRunId:'running'},{...config,enabled:false},{...config,nextAllowedAt:new Date(Date.now()+60000).toISOString()},{...config,keywords:[]}])expect(collectionStartRequest(c,readiness,'key')).toBeNull();
  expect(collectionStartRequest(config,{...readiness,device:null},'key')).toBeNull();
  expect(collectionStartRequest(config,{...readiness,mode:'MOCK'},'key')).toBeNull();
 });
 it('rejects a stale saved scope but accepts identical refreshed metadata',()=>{
  expect(sameCollectionSetup(config,{...config})).toBe(true);
  for(const changed of [{revision:3},{id:'another'},{defaultExecutionAccountId:'other-account'},{batchLimit:3},{mode:'MOCK' as const}])expect(sameCollectionSetup(config,{...config,...changed})).toBe(false);
 });
 it('mock runs do not carry real account or consent',()=>{
  const body=collectionStartRequest({...config,mode:'MOCK'},readiness,'key')?.body;
  expect(body).not.toHaveProperty('accountId');expect(body).not.toHaveProperty('consent');expect(body?.readPlan.commentPages).toBe(4);
 });
});
