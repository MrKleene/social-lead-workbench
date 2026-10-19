import type { Lead } from '@/lib/types';

// Existing objects keep their visual order and source text. Permission removal is immediate.
// State/ownership/version remain live, so actions never use a frozen permission or version.
export function reconcileResults(accepted: Lead[], incoming: Lead[]): Lead[] {
  const live = new Map(incoming.map(lead => [lead.id, lead]));
  const known = new Set(accepted.map(lead => lead.id));
  return [
    ...accepted.flatMap(old => {
      const next = live.get(old.id);
      return next ? [{ ...next, identity: old.identity, summary: old.summary, evidence: old.evidence }] : [];
    }),
    ...incoming.filter(lead => !known.has(lead.id)),
  ];
}
export function changedSources(accepted: Lead[], incoming: Lead[]): number {
  const live = new Map(incoming.map(lead => [lead.id, lead]));
  return accepted.filter(old => {
    const next = live.get(old.id);
    return next && JSON.stringify([old.identity, old.evidence, old.summary]) !== JSON.stringify([next.identity, next.evidence, next.summary]);
  }).length;
}
