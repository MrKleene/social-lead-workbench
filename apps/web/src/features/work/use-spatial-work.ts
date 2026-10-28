import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/use-auth';
import { useAccounts } from '@/features/accounts/use-accounts';
import { useWork } from './use-work';
import {activeWorkModule,type SpaceModule} from './navigation-policy';
export type {SpaceModule} from './navigation-policy';
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
  const active=activeWorkModule(params.toString(),id,admin);
  const moduleHistory=useRef<Partial<Record<SpaceModule,string>>>({});
  useEffect(()=>{if(active)moduleHistory.current[active]=`/work${id?`/${id}`:''}?${params}`;},[active,id,params]);
  const previousModule=useRef(active);
  useEffect(()=>{if(previousModule.current && !active)document.querySelector<HTMLButtonElement>('.core-start')?.focus({preventScroll:true});previousModule.current=active;},[active]);
  const [pagination, setPagination] = useState<Record<string, number>>({});
  const detailScroll=useRef(new Map<string,number>()).current;
  const pageKey = `${view}:${work.search}:${work.unassigned}`;
  const pages = Math.max(1, Math.ceil(work.rows.length / SPACE_PAGE_SIZE));
  const page = Math.min(pagination[pageKey] || 0, pages - 1);
  const rows = work.rows.slice(page * SPACE_PAGE_SIZE, (page + 1) * SPACE_PAGE_SIZE);
  const openModule = (module: SpaceModule, config?: string) => {
    if(!config && moduleHistory.current[module]) { navigate(moduleHistory.current[module]!); return; }
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
  return { detailScroll, accounts, admin, id, view, work, active, rows, page, pages, configs, selectedConfig, openModule, setView, closeDetail, openLead,
    openCollectionSettings:()=>navigate(`/work?module=runs${selectedConfig?`&config=${encodeURIComponent(selectedConfig.id)}`:''}&panel=collection-settings`),
    overview: () => navigate(selectedConfig ? `/work?config=${selectedConfig.id}` : '/work'), setConfig: (config: string) => setParams(p => { p.set('config', config);p.delete('run');p.delete('fresh'); return p; }),
    setPage: (next: number) => { setPagination(current=>({...current,[pageKey]:Math.max(0,Math.min(next,pages-1))})); if(id) closeDetail(); },
    unread: (work.notices.data || []).filter(n => !n.reads.length),
  };
}
export type SpatialState = ReturnType<typeof useSpatialWork>;
