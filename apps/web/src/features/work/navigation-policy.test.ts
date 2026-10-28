import { describe,it,expect } from 'vitest';
import { shouldProtectDrafts,legacyWorkspacePath,activeWorkModule } from './navigation-policy';
describe('Unsaved workspace navigation',()=>{
 it('keeps settings and template drafts across module and lead navigation',()=>{expect(shouldProtectDrafts(['retained'],'/work','/work')).toBe(false);expect(shouldProtectDrafts(['retained'],'/work','/work/lead-1')).toBe(false);});
 it('guards departure, including lookalike route prefixes',()=>{for(const path of ['/templates','/leads','/work-other'])expect(shouldProtectDrafts(['retained'],'/work',path)).toBe(true);});
 it('guards changing or closing a lead with unsaved form data',()=>{expect(shouldProtectDrafts(['lead'],'/work/one','/work/two')).toBe(true);expect(shouldProtectDrafts(['lead'],'/work/one','/work')).toBe(true);});
 it('does not block clean navigation',()=>expect(shouldProtectDrafts([],'/work','/leads')).toBe(false));
 it('preserves legacy settings identity and template deep links',()=>{expect(legacyWorkspacePath('settings','config 1')).toBe('/work?module=settings&config=config+1');expect(legacyWorkspacePath('templates')).toBe('/work?module=templates');});
});

import {activeNavigation,navigationPath,primaryNavigation,secondaryNavigation} from '../../components/app-navigation/navigation-model';
describe('Single application navigation',()=>{
 it('matches exactly one real workspace module, never every /work query link',()=>{for(const item of [...primaryNavigation,...secondaryNavigation].filter(x=>x.module)){expect(activeNavigation('/work',new URL(item.path,'http://localhost').search,true)).toBe(item.id);}expect(activeNavigation('/work','?config=saved',true)).toBe('overview');});
 it('retains view/detail priority and existing role behavior',()=>{expect(activeWorkModule('?view=follow','lead-1',true)).toBe('follow');expect(activeWorkModule('?module=runs&view=follow',undefined,true)).toBe('runs');expect(activeWorkModule('?view=contacted','lead-1',true)).toBe('matches');expect(activeWorkModule('?module=runs',undefined,false)).toBeNull();expect(activeWorkModule('?module=accounts',undefined,false)).toBe('accounts');expect(activeNavigation('/work-other','',true)).toBeNull();});
 it('distinguishes review, all leads and historical lead details',()=>{expect(activeNavigation('/comment-review','',true)).toBe('review');expect(activeNavigation('/comment-review','',false)).toBeNull();expect(activeNavigation('/leads/one','',true)).toBe('all-leads');expect(activeNavigation('/work/one','?view=new',true)).toBe('matches');});
 it('resumes each module URL and selected configuration without relabelling destinations',()=>{const follow=primaryNavigation.find(x=>x.id==='follow')!,home=primaryNavigation[0],current={pathname:'/comment-review',search:''};expect(navigationPath(follow,current,{follow:'/work/lead-1?module=follow&view=follow&config=cfg'},'?config=other')).toBe('/work/lead-1?module=follow&view=follow&config=cfg');expect(navigationPath(follow,current,{},'?config=cfg')).toBe('/work?config=cfg&module=follow&view=follow');expect(navigationPath(home,current,{},'?config=cfg&module=runs')).toBe('/work?config=cfg');});
});

it('reply records have a direct administrator-only primary route',()=>{expect(primaryNavigation.find(x=>x.id==='reply-history')).toMatchObject({label:'回复记录',path:'/reply-history',adminOnly:true});expect(activeNavigation('/reply-history','?outcome=UNKNOWN',true)).toBe('reply-history');expect(activeNavigation('/reply-history','',false)).toBeNull();});
