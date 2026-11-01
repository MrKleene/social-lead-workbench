import {it,expect} from 'vitest';
import {runSelection,returnRunLabel,type RunHistory} from './use-run-history';
import type {Run} from '@/features/collection/types';
const run=(id:string)=>({id,status:'COMPLETE',createdAt:'2026-01-01'} as Run);
const data={items:[run('new')],current:run('active'),activePhase:'review',selected:run('old'),selectedMissing:false,nextCursor:null} as RunHistory;
it('defaults to the execution run even after collection finished',()=>expect(runSelection(data,'',false).run?.id).toBe('active'));
it('keeps explicit historical selection when current finishes or changes',()=>{for(const current of [run('new'),run('active')])expect(runSelection({...data,current},'old',false)).toMatchObject({run:{id:'old'},history:true});});
it('does not reuse old records while a new selection is loading',()=>expect(runSelection(undefined,'new-id',false)).toMatchObject({run:undefined,current:undefined}));
it('invalid selected run does not fall back silently',()=>expect(runSelection({...data,selected:null,selectedMissing:true},'missing',false)).toMatchObject({run:undefined,missing:true}));
it('fresh view remains empty until explicit start success',()=>expect(runSelection(data,'',true).run).toBeUndefined());
it('returning to current removes historical mode',()=>expect(runSelection({...data,selected:data.current},'active',false).history).toBe(false));

it('labels latest when idle, ongoing for every active stage',()=>{expect(returnRunLabel(null)).toBe('返回最新任务');for(const stage of ['collect','review','contact'] as const)expect(returnRunLabel(stage)).toBe('返回进行中任务');});
