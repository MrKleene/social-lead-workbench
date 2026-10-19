import { useState } from 'react';
import type { Lead } from '@/lib/types';
import { changedSources, reconcileResults } from './stable-results';

export function useStableResults(data: Lead[] | undefined) {
  const [snapshot, setSnapshot] = useState<{ source: Lead[] | undefined; accepted: Lead[] }>({ source: undefined, accepted: [] });
  // React's render-time adjustment avoids an effect frame showing a reordered result list.
  if (data && snapshot.source !== data) {
    setSnapshot({ source: data, accepted: reconcileResults(snapshot.accepted, data) });
  }
  return {
    all: data ? reconcileResults(snapshot.accepted, data) : [],
    sourceUpdates: data ? changedSources(snapshot.accepted, data) : 0,
    applySources: () => { if (data) setSnapshot({ source: data, accepted: reconcileResults(snapshot.accepted, data).map(old => data.find(item => item.id === old.id)!) }); },
  };
}
