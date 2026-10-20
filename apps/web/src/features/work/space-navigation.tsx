import { Fragment, useLayoutEffect, type CSSProperties } from 'react';
import { Search, Database, Network, MessagesSquare, UserRound, ArrowRight } from 'lucide-react';
import { CoreParticles, FlowParticles } from './space-particles';
import type { SpatialState } from './use-spatial-work';
const nodes = [
  { id:'settings', title:'搜索设置', subtitle:'设置关键词与平台范围', icon:Search, x:27, y:20, ex:22, ey:20, color:'#9cd1ff' },
  { id:'runs', title:'采集任务', subtitle:'有限读取，记录采集进度', icon:Database, x:18, y:48, ex:23, ey:35, color:'#ebc992' },
  { id:'matches', title:'匹配线索', subtitle:'规则筛选，保留人工判断', icon:Network, x:28, y:72, ex:23.5, ey:50, color:'#bf9bff' },
  { id:'templates', title:'回复话术', subtitle:'管理评论与私信模板', icon:MessagesSquare, x:74, y:23, ex:23, ey:65, color:'#f6ada8' },
  { id:'follow', title:'销售跟进', subtitle:'标记线索，记录跟进进展', icon:UserRound, x:76, y:69, ex:22, ey:80, color:'#9dd9b4' },
];
export function SpaceNavigation({ state }: { state: SpatialState }) {
  const expanded = !!state.active;
  useLayoutEffect(()=>{if(state.active&&matchMedia('(max-width:900px)').matches)document.querySelector<HTMLElement>(`.node-${state.active}`)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});},[state.active]);
  const counts: Record<string,number> = { settings:state.configs.length, runs:state.configs.filter(c=>c.activeRunId).length, matches:state.work.fresh.length, templates:state.work.templates.data?.length || 0, follow:state.work.follow.length };
  const activeRun = !!state.selectedConfig?.activeRunId;
  return <div className="space-map" aria-label="工作模块">
    <svg className="space-connectors" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
      {nodes.map((n,i) => { const path=expanded ? `M 85 350 Q 180 ${n.ey*7} ${n.ex*10} ${n.ey*7}` : `M 500 336 Q ${n.x < 50 ? 300 : 720} ${n.y*7-90} ${n.x*10} ${n.y*7}`; return <Fragment key={n.id}><path className={state.active === n.id ? 'is-lit' : ''} stroke={n.color} d={path}/><FlowParticles path={path} color={n.color} phase={i}/></Fragment>; })}
    </svg>
    <div className="space-core" data-running={activeRun}>
      <div className="planet-material space-orb-motion"><img className="planet-art" src="/space/champagne-planet.png" alt=""/><span className="planet-atmosphere"/><span className="planet-ring"/></div>
      <CoreParticles/>
      <div className="space-core-content">
        {expanded ? <button className="core-home" onClick={state.overview} aria-label="收拢并返回环绕总览">线索工作台<span>返回总览</span></button> : <>
          <h1>线索工作台</h1><p>查看原文，保留人的判断。</p><span className="space-mode">来源模式单独标记 · 真实发送禁用</span>
          <button className="gold-action core-start" onClick={state.start} disabled={(state.admin && state.work.configs.isPending) || state.work.mutation.isPending || (state.admin && (activeRun || (state.selectedConfig ? !state.selectedConfig.enabled || (!!state.selectedConfig.nextAllowedAt && new Date(state.selectedConfig.nextAllowedAt)>new Date()) : false)))}>{activeRun ? '有限读取中' : state.admin ? '开始找线索' : '查看我的线索'}<ArrowRight size={20}/></button>
          {state.admin && state.configs.length > 0 && <select aria-label="总览使用的搜索设置" value={state.selectedConfig?.id} onChange={e=>state.setConfig(e.target.value)}>{state.configs.map(c=><option value={c.id} key={c.id}>{c.name}{!c.enabled?'（已暂停）':''}</option>)}</select>}
          {!state.admin && <small>仅显示已分配给你的线索</small>}
          {state.admin && !state.configs.length && !state.work.configs.isPending && <small>先设置关键词，再开始有限读取</small>}
        </>}
      </div>
    </div>
    {nodes.map(n => {
      const Icon=n.icon, restricted=!state.admin && ['settings','runs','templates'].includes(n.id);
      const style={ '--x':`${n.x}%`, '--y':`${n.y}%`, '--ex':`${n.ex}%`, '--ey':`${n.ey}%`, '--node-color':n.color } as CSSProperties;
      const content=<><span className="node-orb"><span className="node-material space-orb-motion"><img src="/space/ribbon-halo.png" alt=""/><span className="node-orbit"/></span><Icon aria-hidden="true"/></span><span className="node-label"><strong>{n.title}</strong><small>{restricted ? '管理员配置' : expanded ? `${counts[n.id]} ${n.id==='runs'?'个运行中':'项'}` : n.subtitle}</small></span></>;
      const cls=`space-node node-${n.id}${state.active===n.id?' selected':''}`;
      if(restricted) return <div key={n.id} className={`${cls} restricted`} style={style} aria-label={`${n.title}：管理员配置`}>{content}</div>;
      return <button key={n.id} className={cls} style={style} aria-pressed={state.active===n.id} onClick={()=>state.openModule(n.id as 'runs'|'matches'|'follow'|'settings'|'templates')}>{content}</button>;
    })}
  </div>;
}
