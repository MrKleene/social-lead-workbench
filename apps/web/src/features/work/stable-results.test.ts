import { describe, expect, it } from 'vitest';
import { changedSources, reconcileResults } from './stable-results';
import type { Lead } from '@/lib/types';
const lead = (id: string, version = 0): Lead => ({ id, version, summary: id, evidence: id, identity: { nickname: id, platform: 'XHS', platformUserId: id, comments: [] }, owner: null, status: 'PENDING_REVIEW', reviewedAt: null, reviewNote: null, nextFollowUpAt: null, isDemo: true });
describe('stable workbench results', () => {
  it('appends new results without moving existing click targets when server order changes', () => {
    const a = lead('a'), b = lead('b'), c = lead('c');
    expect(reconcileResults([a,b], [c,b,a]).map(x=>x.id)).toEqual(['a','b','c']);
  });
  it('immediately removes inaccessible results rather than preserving stale permissions', () => {
    expect(reconcileResults([lead('a'),lead('b')], [lead('b')]).map(x=>x.id)).toEqual(['b']);
  });
  it('holds source text while updating version, owner and manually recorded contact state', () => {
    const a=lead('a'); const update={ ...a, version: 4, evidence:'long new evidence', contactStage:'CONTACTED' as const, owner:{ id:'sales',name:'Sales' } };
    const [current]=reconcileResults([a],[update]);
    expect(current.evidence).toBe('a'); expect(current.version).toBe(4); expect(current.owner).toEqual(update.owner); expect(current.contactStage).toBe('CONTACTED'); expect(changedSources([a],[update])).toBe(1);
  });
  it('keeps the first page unchanged when results arrive beyond its 20 rows', () => {
    const first=Array.from({length:20},(_,i)=>lead(String(i)));const next=reconcileResults(first,[lead('new'),...first.slice().reverse()]);
    expect(next.slice(0,20).map(x=>x.id)).toEqual(first.map(x=>x.id));expect(next[20].id).toBe('new');
  });
  it('does not report irrelevant version changes as source updates', () => {
    expect(changedSources([lead('a')],[lead('a',2)])).toBe(0);
    const a=lead('a'); expect(changedSources([a],[{...a,identity:{...a.identity,nickname:'Updated'}}])).toBe(1);
    expect(reconcileResults([lead('a')],[])).toEqual([]);
  });
});
