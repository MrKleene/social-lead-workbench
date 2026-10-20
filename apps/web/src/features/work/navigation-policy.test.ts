import { describe,it,expect } from 'vitest';
import { shouldProtectDrafts,legacyWorkspacePath } from './navigation-policy';
describe('Unsaved workspace navigation',()=>{
 it('keeps settings and template drafts across module and lead navigation',()=>{expect(shouldProtectDrafts(['retained'],'/work','/work')).toBe(false);expect(shouldProtectDrafts(['retained'],'/work','/work/lead-1')).toBe(false);});
 it('guards departure, including lookalike route prefixes',()=>{for(const path of ['/templates','/leads','/work-other'])expect(shouldProtectDrafts(['retained'],'/work',path)).toBe(true);});
 it('guards changing or closing a lead with unsaved form data',()=>{expect(shouldProtectDrafts(['lead'],'/work/one','/work/two')).toBe(true);expect(shouldProtectDrafts(['lead'],'/work/one','/work')).toBe(true);});
 it('does not block clean navigation',()=>expect(shouldProtectDrafts([],'/work','/leads')).toBe(false));
 it('preserves legacy settings identity and template deep links',()=>{expect(legacyWorkspacePath('settings','config 1')).toBe('/work?module=settings&config=config+1');expect(legacyWorkspacePath('templates')).toBe('/work?module=templates');});
});
