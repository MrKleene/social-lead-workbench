import { modeLabels, runRequest } from '@/features/collection/mode';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/use-auth';
import { useAccounts } from '@/features/accounts/use-accounts';
import { useWork } from './use-work';
export type SpaceModule = 'matches' | 'runs' | 'follow' | 'notices' | 'settings' | 'templates' | 'accounts';
export const SPACE_PAGE_SIZE = 3;
export function useSpatialWork() {
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const [params, setParams] = useSearchParams();
  const { id } = useParams();
  const navigate = useNavigate();
  const view = params.get('view') || 'new';
  const work = useWork(admin, view);
  const accounts = useAccounts();
  const requested = params.get('module');
  const active: SpaceModule | null = requested === 'accounts' ? 'accounts' : (requested === 'settings' || requested === 'templates') && admin ? requested : requested === 'runs' && admin ? 'runs' : requested === 'notices' ? 'notices' : requested === 'follow' || view === 'follow' ? 'follow' : id || requested === 'matches' || params.has('view') ? 'matches' : null;
  const previousModule=useRef(active);
  useEffect(()=>{if(previousModule.current && !active)document.querySelector<HTMLButtonElement>('.core-start')?.focus({preventScroll:true});previousModule.current=active;},[active]);
  const [pagination, setPagination] = useState({ key: '', page: 0 });
  const pageKey = `${view}:${work.search}:${work.unassigned}`;
  const pages = Math.max(1, Math.ceil(work.rows.length / SPACE_PAGE_SIZE));
  const page = Math.min(pagination.key === pageKey ? pagination.page : 0, pages - 1);
  const rows = work.rows.slice(page * SPACE_PAGE_SIZE, (page + 1) * SPACE_PAGE_SIZE);
  const openModule = (module: SpaceModule, config?: string) => {
    work.clearSelection();
    const next = new URLSearchParams(params); next.set('module', module);
    if(config) next.set('config', config);
    next.set('view', module === 'follow' ? 'follow' : 'new');
    navigate(`/work?${next}`);
  };
  const setView = (next: string) => { work.clearSelection(); setParams(p => { p.set('view', next); p.set('module', next === 'follow' ? 'follow' : 'matches'); return p; }); };
  const closeDetail = () => navigate(`/work?${params}`);
  const openLead = (leadId: string) => { const next = new URLSearchParams(params); next.set('module', active === 'follow' ? 'follow' : 'matches'); next.set('view', view); navigate(`/work/${leadId}?${next}`); };
  const configs = work.configs.data || [];
  const selectedConfig = configs.find(c => c.id === params.get('config')) || configs.find(c => c.enabled) || configs[0];
  const start = () => {
    if (!admin) { navigate('/work?module=matches&view=contacted'); return; }
    if (!selectedConfig) { openModule('settings'); return; }
    work.mutation.mutate({ path: `/collection/configs/${selectedConfig.id}/runs`, body: runRequest(selectedConfig, 'BASELINE', crypto.randomUUID()) }, { onSuccess: () => { work.setFeedback(`已开始一轮${modeLabels[selectedConfig.mode]}。首次记录不提醒，覆盖范围见运行记录。`); openModule('runs'); } });
  };
  return { accounts, admin, id, view, work, active, rows, page, pages, configs, selectedConfig, start, openModule, setView, closeDetail, openLead,
    overview: () => navigate('/work'), setConfig: (config: string) => setParams(p => { p.set('config', config); return p; }),
    setPage: (next: number) => { setPagination({ key: pageKey, page: Math.max(0, Math.min(next, pages - 1)) }); if(id) closeDetail(); },
    unread: (work.notices.data || []).filter(n => !n.reads.length),
  };
}
export type SpatialState = ReturnType<typeof useSpatialWork>;
