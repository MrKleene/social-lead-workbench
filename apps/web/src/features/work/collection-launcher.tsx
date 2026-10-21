import {RunStats} from '@/features/collection/run-stats';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/feedback';
import { Config, reasonLabels, runLabels, scenarios } from '@/features/collection/types';
import { useWorkspaceMutation, useRefreshCollection } from '@/features/collection/use-collection';
import { ConfigDetailPanel } from '@/features/collection/config-detail';
import { modeLabels, runRequest } from '@/features/collection/mode';
import { AccountReadChoice } from '@/features/collection/account-read-choice';
import { useMcpReadiness } from '@/features/collection/use-collection';
import { TaskCore } from './task-core';
import { legacyWorkspacePath } from './navigation-policy';
export function CollectionLauncher({ configs, loading, initialId, runsOpen, onRuns }: {
  configs: Config[]; loading: boolean; initialId?: string | null; runsOpen: boolean; onRuns: () => void;
}) {
  const readiness=useMcpReadiness();
  const [accountId,setAccountId]=useState(''),[consent,setConsent]=useState(false);
  const [choice, setChoice] = useState(initialId || '');
  const [scenario, setScenario] = useState('BASELINE');
  const [feedback, setFeedback] = useState('');
  const selected = configs.find(c => c.id === choice) || configs.find(c => c.enabled) || configs[0];
  const mutation = useWorkspaceMutation();
  const refresh = useRefreshCollection();
  const backoff = !!selected?.nextAllowedAt && new Date(selected.nextAllowedAt) > new Date();
  const active = selected?.activeRunId;
  const accountBound=!!readiness.data?.accountBound && selected?.mode!=="MOCK";
  const accountReady=!!readiness.data?.device?.online&&readiness.data.accounts?.some(a=>a.id===accountId&&a.eligible);
  const feedbackText = selected && !selected.enabled
    ? `${reasonLabels[selected.pauseReason || ''] || '配置已暂停'}。请在搜索设置中核查。`
    : backoff ? '正在退避，请稍后手动刷新重试。' : feedback || (selected?.mode !== 'MOCK' ? '首次建立已读窗口起点；后续仅提醒新观察到的评论，发布时间未验证。' : '首次完整读取建立基线；后续新增评论才提醒。');
  const status = active ? runLabels[selected.runs[0]?.status] || '排队中' : !selected ? '待设置' : !selected.enabled ? '已暂停' : backoff ? '退避中' : '待命';
  return <section className="collection-console" aria-label="采集控制台">
    <div className="console-main">
      <TaskCore status={status} running={!!active}/>
      <div className="console-controls">
        <div className="console-title"><div><h2>开始找线索</h2><p>{selected ? `${modeLabels[selected.mode]} · 手动运行一轮有限批次。` : '选择配置后手动运行有限批次。'}</p></div><Link to={legacyWorkspacePath('settings', selected?.id)}><Settings2 size={15}/>搜索设置</Link></div>
        {loading ? <p>正在读取搜索设置…</p> : selected ? <>
          <div className="collection-runbar"><label>本次使用的搜索设置<select aria-label="本次使用的搜索设置" value={selected.id} onChange={e => { setChoice(e.target.value); setConsent(false); setFeedback(''); }}>{configs.map(c => <option key={c.id} value={c.id}>{c.name}{!c.enabled ? '（已暂停）' : ''}</option>)}</select></label>
            <Button className="start-collection" disabled={!selected.enabled || !!active || backoff || mutation.isPending || (accountBound && (!consent || !accountReady))} onClick={() => mutation.mutate({ path: `/collection/configs/${selected.id}/runs`, body: {...runRequest(selected, scenario, crypto.randomUUID()),...(accountBound?{accountId,consent:"account-read-window-v1"}:{})} }, { onSuccess: () => {setConsent(false);setFeedback(`已提交「${selected.name}」的一轮${modeLabels[selected.mode]}。`);} })}><Play size={16}/>开始找线索（{modeLabels[selected.mode]}）</Button>
            {active && <Button variant="outline" onClick={() => mutation.mutate({ path: `/collection/runs/${active}/pause` })}><Pause size={16}/>暂停本轮</Button>}
          </div>
          {accountBound&&<AccountReadChoice accountId={accountId} onAccount={setAccountId} consent={consent} onConsent={setConsent}/>}
          <dl className="console-terms"><div><dt>关键词</dt><dd>{selected.keywords.join(' / ')}</dd></div><div><dt>排除词</dt><dd>{selected.excludeWords.join(' / ') || '无'}<span>每轮最多 {selected.batchLimit} 帖 · 32 个内部步骤</span></dd></div></dl>
        </> : <div className="console-empty"><p>先添加关键词和排除词，再回到这里开始。</p><Button asChild><Link to={legacyWorkspacePath('settings')}>去搜索设置</Link></Button></div>}
        <div className="console-links"><Button className="refresh-local-status" variant="ghost" size="sm" onClick={() => void refresh()}>刷新本地任务状态</Button><Button variant="ghost" size="sm" aria-expanded={runsOpen} aria-controls="run-module" onClick={onRuns}>查看运行记录</Button>{selected?.mode === 'MOCK' && <details><summary>模拟验收选项</summary><label>模拟场景<select aria-label="模拟场景" value={scenario} onChange={e => setScenario(e.target.value)}>{Object.entries(scenarios).filter(([k]) => k !== 'READ_WINDOW').map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label></details>}</div>
        <div className="console-feedback" role="status">{feedbackText}</div><ErrorNotice error={mutation.error}/>
      </div>
    </div>
    <div className="module-expansion" data-open={runsOpen} id="run-module" inert={!runsOpen} aria-hidden={!runsOpen}><div><section className="console-history">
      <h3>集中采集进度</h3><div className="run-list">{configs.filter(c => c.runs.length).map(c => { const r = c.runs[0]; return <article key={c.id}><strong>{c.name} · {runLabels[r.status]}</strong><RunStats run={r}/>{r.reason && <small>{reasonLabels[r.reason] || r.reason}</small>}</article>; })}</div>
      {!configs.some(c => c.runs.length) && <p>尚未运行。结果会出现在下面的匹配评论。</p>}
      {selected && <details><summary>所选设置的运行记录与覆盖范围</summary><ConfigDetailPanel key={selected.id} id={selected.id}/></details>}
    </section></div></div>
  </section>;
}
