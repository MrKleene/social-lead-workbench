import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Settings2,Bell,House,Play,Archive,UsersRound,MessageSquare,BriefcaseBusiness,ContactRound} from 'lucide-react';
import type {SpatialState} from './use-spatial-work';
const modules=[{id:'runs',title:'采集任务',icon:Play,admin:true},{id:'archive',title:'采集信息',icon:Archive,admin:true},{id:'matches',title:'线索池',icon:UsersRound},{id:'templates',title:'联系与回复',icon:MessageSquare,admin:true},{id:'follow',title:'销售跟进',icon:BriefcaseBusiness},{id:'accounts',title:'账号中心',icon:ContactRound}] as const;
export function SpaceNavigation({state}:{state:SpatialState}){
 const [host,setHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{setHost(document.getElementById('workspace-navigation'));},[]);
 const nav=<nav className="mist-navigation orbit-secondary" aria-label="工作区导航"><button className={!state.active?'space-node selected':'space-node'} aria-current={!state.active?'page':undefined} onClick={state.overview}><House size={15}/>工作台</button>{modules.filter(n=>!('admin' in n)||state.admin).map(n=><button key={n.id} className={state.active===n.id?'space-node selected':'space-node'} aria-current={state.active===n.id?'page':undefined} onClick={()=>state.openModule(n.id)}><n.icon size={15}/>{n.title}</button>)}<button className={state.active==='notices'?'space-node selected':'space-node'} aria-label={`提醒与异常 ${state.unread.length+state.work.exceptions.length}`} onClick={()=>state.openModule('notices')}><Bell size={16}/><span className="mist-compact-label">提醒</span>{state.unread.length>0&&<span className="mist-nav-dot"/>}</button>{state.admin&&<button className={state.active==='settings'?'space-node selected':'space-node'} aria-label="搜索与模型设置" onClick={()=>state.openModule('settings')}><Settings2 size={16}/><span className="mist-compact-label">设置</span></button>}</nav>;
 return host?createPortal(nav,host):null;
}
