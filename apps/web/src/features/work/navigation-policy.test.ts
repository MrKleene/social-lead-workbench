import { describe,it,expect } from 'vitest';
import { shouldProtectDrafts,legacyWorkspacePath,activeWorkModule } from './navigation-policy';
describe('Unsaved workspace navigation',()=>{
 it('keeps settings and template drafts across workspace navigation',()=>{expect(shouldProtectDrafts(['retained'],'/work','/work')).toBe(false);expect(shouldProtectDrafts(['retained'],'/work','/work/lead-1')).toBe(false);});
 it('guards departure, including lookalike route prefixes',()=>{for(const path of ['/templates','/leads','/work-other'])expect(shouldProtectDrafts(['retained'],'/work',path)).toBe(true);});
 it('does not block clean navigation',()=>expect(shouldProtectDrafts([],'/work','/leads')).toBe(false));
 it('preserves legacy settings identity and template deep links',()=>{expect(legacyWorkspacePath('settings','config 1')).toBe('/work?module=settings&config=config+1');expect(legacyWorkspacePath('templates')).toBe('/work?module=templates');});
});

import {activeNavigation,navigationPath,primaryNavigation,secondaryNavigation} from '../../components/app-navigation/navigation-model';
describe('Single application navigation',()=>{
 it('matches exactly one real workspace module, never every /work query link',()=>{for(const item of [...primaryNavigation,...secondaryNavigation].filter(x=>x.module)){expect(activeNavigation(new URL(item.path,'http://localhost').pathname,new URL(item.path,'http://localhost').search,true)).toBe(item.id);}expect(activeNavigation('/work','?config=saved',true)).toBe('overview');});
 it('retains view/detail priority and existing role behavior',()=>{expect(activeWorkModule('?view=follow','lead-1',true)).toBeNull();expect(activeWorkModule('?module=runs&view=follow',undefined,true)).toBe('runs');expect(activeWorkModule('?view=contacted','lead-1',true)).toBeNull();expect(activeWorkModule('?module=runs',undefined,false)).toBeNull();expect(activeWorkModule('?module=accounts',undefined,false)).toBe('accounts');expect(activeNavigation('/work-other','',true)).toBeNull();});
 it('distinguishes review, all leads and historical lead details',()=>{expect(activeNavigation('/comment-review','',true)).toBe('review');expect(activeNavigation('/comment-review','',false)).toBeNull();expect(activeNavigation('/leads/one','',true)).toBeNull();expect(activeNavigation('/work/one','?view=new',true)).toBe('overview');});
 it('retired modules cannot reappear in navigation history',()=>{const all=[...primaryNavigation,...secondaryNavigation];expect(all.some(x=>['follow','matches','tasks','all-leads'].includes(x.id))).toBe(false);expect(navigationPath(primaryNavigation.find(x=>x.id==='overview')!,{pathname:'/work/old',search:'?module=follow'},{follow:'/work/old'},'')).toBe('/work');});
});

it('reply records have a direct administrator-only primary route',()=>{expect(primaryNavigation.find(x=>x.id==='reply-history')).toMatchObject({label:'回复记录',path:'/reply-history',adminOnly:true});expect(activeNavigation('/reply-history','?outcome=UNKNOWN',true)).toBe('reply-history');expect(activeNavigation('/reply-history','',false)).toBeNull();});

it('separates homepage and data workspace while retaining task deep links',()=>{expect(activeNavigation('/home','',true)).toBe('home');expect(activeNavigation('/work','',true)).toBe('overview');expect(activeNavigation('/work','?module=runs&run=old&stage=contact',true)).toBe('runs');expect(primaryNavigation.some(i=>i.id==='home')).toBe(false);expect(primaryNavigation.find(i=>i.id==='overview')?.label).toBe('工作台');});

import {automationPath} from './navigation-policy';
it('canonical task links are distinct from project overview and preserve legacy identity',()=>{expect(automationPath('?module=runs&config=a&run=b&stage=review&view=new')).toBe('/automation?config=a&run=b&stage=review');expect(activeNavigation('/automation','?run=b',true)).toBe('runs');expect(navigationPath(primaryNavigation.find(x=>x.id==='runs')!,{pathname:'/work',search:''},{},'')).toBe('/automation');});


it('distinguishes policy configuration from review results while preserving existing deep links',()=>{
 expect(activeNavigation('/comment-review','?manage=1&policy=example',true)).toBe('configuration');
 expect(activeNavigation('/comment-review','?policy=example',true)).toBe('review');
 expect(activeNavigation('/comment-review','?manage=1',false)).toBeNull();
 expect(activeNavigation('/work','?module=settings&config=example',true)).toBe('configuration');
 expect(activeNavigation('/work','?module=templates',true)).toBe('configuration');
 const item=secondaryNavigation.find(i=>i.id==='configuration')!;
 expect(navigationPath(item,{pathname:'/comment-review',search:'?policy=old'},{},'')).toBe('/configuration?tab=keywords');
 expect(navigationPath(secondaryNavigation.find(i=>i.id==='review')!,{pathname:'/comment-review',search:'?manage=1'},{},'')).toBe('/comment-review');
});

it('recognizes the standalone policy route without broadening sales access',()=>{expect(activeNavigation('/review-policies','',true)).toBe('configuration');expect(activeNavigation('/review-policies','',false)).toBeNull();});
