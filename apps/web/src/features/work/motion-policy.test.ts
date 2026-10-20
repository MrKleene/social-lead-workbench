import { describe, expect, it } from 'vitest';
import { bindWorkspaceVisibility } from './workspace-visibility';
import { reduceWorkspaceMotion } from './motion-policy';
describe('Workspace motion preference',()=>{
 it('honors both values of the OS preference by default',()=>{expect(reduceWorkspaceMotion('system',true)).toBe(true);expect(reduceWorkspaceMotion('system',false)).toBe(false);});
 it('keeps an explicit pause when OS reduction is off',()=>expect(reduceWorkspaceMotion('reduced',false)).toBe(true));
 it('allows a page-only opt-in without requiring an OS change',()=>expect(reduceWorkspaceMotion('full',true)).toBe(false));
 it('preserves the explicit page choice when OS preference changes',()=>{for(const os of [false,true]){expect(reduceWorkspaceMotion('full',os)).toBe(false);expect(reduceWorkspaceMotion('reduced',os)).toBe(true);}});
});

describe('Visibility pause lifecycle',()=>{
 it('pauses on hidden, resumes on visible, and releases the listener on logout',()=>{
  const doc=Object.assign(new EventTarget(),{hidden:false});const target={dataset:{} as DOMStringMap};
  const stop=bindWorkspaceVisibility(doc,target);expect(target.dataset.crmHidden).toBe('false');
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));expect(target.dataset.crmHidden).toBe('true');
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));expect(target.dataset.crmHidden).toBe('false');
  stop();doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));expect(target.dataset.crmHidden).toBeUndefined();
 });
});
