import {createElement,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {DetailForms,localFollowUpDate,retainedFollowUpDate} from './lead-detail-forms';
import type {Lead} from '@/lib/types';
import type {useLead} from './use-leads';
vi.mock('@/components/select-field',()=>({SelectField:({children,value,disabled,id}:{children:ReactNode;value:string;disabled?:boolean;id:string})=>createElement('select',{value,disabled,id,onChange:()=>{}},children),SelectOption:({children,value,disabled}:{children:ReactNode;value:string;disabled?:boolean})=>createElement('option',{value,disabled},children)}));
vi.mock('@/features/work/draft-guard',()=>({useDraftGuard:()=>async()=>true}));
// Surface each independent dialog for SSR inspection; real dialog interactions are checked in browser QA.
vi.mock('@/components/information-panel',()=>({InfoSection:({children}:{children:ReactNode})=>createElement('section',null,children),InfoDrawer:({title,description,children,busy}:{title:ReactNode;description?:string;children:ReactNode;busy:boolean})=>createElement('section',{'data-dialog':title,'data-busy':busy},description,children)}));
const lead={id:'fictional-lead',version:7,status:'FOLLOWING',summary:'虚构需求',owner:{id:'sales-1',name:'虚构销售'},nextFollowUpAt:'2026-11-02T02:00:00.000Z',reviewedAt:null,identity:{nickname:'虚构线索',comments:[]},followups:[]} as unknown as Lead;
const state={users:[{id:'sales-1',name:'虚构销售',role:'SALES'}],usersLoading:false,usersError:null,mutation:{isPending:false,error:null,mutate:vi.fn()}} as unknown as ReturnType<typeof useLead>;
const render=(admin:boolean,pending=false)=>renderToStaticMarkup(createElement(DetailForms,{lead,state:{...state,mutation:{...state.mutation,isPending:pending}} as ReturnType<typeof useLead>,admin,children:createElement('p',null,'既有联系入口')}));
describe('lead detail dialog presentation',()=>{
 it('splits all four forms without an owner entry for sales',()=>{const admin=render(true),sales=render(false);for(const title of ['人工核验','分配负责人','添加沟通记录','创建人工任务'])expect(admin).toContain(`data-dialog="${title}"`);expect(sales).not.toContain('data-dialog="分配负责人"');expect(sales).not.toContain('id="owner"');expect(sales).toContain('虚构销售（只读）');expect(sales).toContain('既有联系入口');});
 it('retains a readable current owner when absent from assignable sales',()=>{const html=renderToStaticMarkup(createElement(DetailForms,{lead,state:{...state,users:[]},admin:true,children:createElement('p',null,'既有联系入口')}));expect(html).toMatch(/<option[^>]*value="sales-1"[^>]*disabled=""[^>]*>虚构销售（当前负责人）/);expect(html).toMatch(/<button[^>]*disabled=""[^>]*>分配 \/ 转交/);});
 it('requires five characters before verification and preserves field limits',()=>{const html=render(true);expect(html).toMatch(/<button[^>]*disabled=""[^>]*>保存人工核验/);expect(html).toContain('minLength="5"');expect(html).toContain('maxLength="2000"');expect(html).toContain('maxLength="4000"');expect(html).toContain('maxLength="200"');expect(html).toContain('仅创建人工跟进任务');});
 it('keeps both dates initialized even when no followup form has been opened',()=>{const html=render(true),date=localFollowUpDate(lead.nextFollowUpAt);expect(html.match(new RegExp(`value="${date}"`,'g'))).toHaveLength(2);expect(html).toContain('id="task-due"');expect(state.mutation.mutate).not.toHaveBeenCalled();});
 it('marks every independent dialog busy and disables editing during saves',()=>{const html=render(true,true);expect(html.match(/data-busy="true"/g)).toHaveLength(4);expect(html).toMatch(/id="review"[^>]*disabled=""/);expect(html).toContain('保存中…');});
 it('retains an edited date across form unmount/reopen while matching the old source key reset',()=>{const saved=lead.nextFollowUpAt,draft={key:saved!,value:'2026-11-03T15:00'};expect(retainedFollowUpDate(saved,draft)).toBe('2026-11-03T15:00');expect(retainedFollowUpDate(saved,draft)).toBe('2026-11-03T15:00');const next='2026-11-04T02:00:00.000Z';expect(retainedFollowUpDate(next,draft)).toBe(localFollowUpDate(next));});
 it('preserves deliberately cleared dates and the original no-date case',()=>{expect(retainedFollowUpDate(lead.nextFollowUpAt,{key:lead.nextFollowUpAt!,value:''})).toBe('');expect(retainedFollowUpDate(null,undefined)).toBe('');expect(retainedFollowUpDate(null,{key:'none',value:'2026-11-03T15:00'})).toBe('2026-11-03T15:00');});
});
