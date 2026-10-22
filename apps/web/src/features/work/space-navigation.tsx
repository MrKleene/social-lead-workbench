import {useEffect,useState} from 'react';
import {Archive,ScanLine,MessagesSquare,ContactRound,UsersRound,House,Bell,Play,Settings2} from 'lucide-react';
import Dock from '@/vendor/react-bits/Dock';
import {useAuroraReduced} from './aurora-motion';
import type {SpatialState} from './use-spatial-work';
const secondary=[{id:'archive',title:'采集信息',icon:Archive,admin:true},{id:'runs',title:'采集任务',icon:Play,admin:true},{id:'matches',title:'评论审核',icon:ScanLine},{id:'follow',title:'销售跟进',icon:UsersRound},{id:'settings',title:'搜索与模型设置',icon:Settings2,admin:true},{id:'templates',title:'回复话术',icon:MessagesSquare,admin:true},{id:'accounts',title:'账号中心',icon:ContactRound},{id:'notices',title:'提醒与异常',icon:Bell}] as const;
export function SpaceNavigation({state}:{state:SpatialState}){
 const reduced=useAuroraReduced();
 const [wide,setWide]=useState(()=>matchMedia('(min-width:1200px)').matches);
 useEffect(()=>{const mq=matchMedia('(min-width:1200px)'),update=()=>setWide(mq.matches);mq.addEventListener('change',update);return()=>mq.removeEventListener('change',update);},[]);
 return <><nav className="orbit-secondary" aria-label="次级工作区">{secondary.filter(n=>!('admin' in n)||state.admin).map(n=><button key={n.id} className={state.active===n.id?'space-node selected':'space-node'} aria-current={state.active===n.id?'page':undefined} onClick={()=>state.openModule(n.id)}><n.icon size={14}/>{n.title}</button>)}</nav><nav className="aurora-dock orbit-dock" aria-label="模块快捷导航"><Dock position={wide?'right':'bottom'} baseItemSize={44} magnification={reduced?44:54} panelHeight={66} gap={12} bounce={!reduced} accentColor="#b7e9cf" showLabels items={[
 {icon:<House size={21}/>,label:'返回工作舱',active:!state.active,onClick:state.overview},
 ...(state.admin?[{icon:<Archive size={21}/>,label:'采集信息',active:state.active==='archive',onClick:()=>state.openModule('archive')}]:[]),
 {icon:<UsersRound size={21}/>,label:'线索与协作',active:state.active==='follow'||state.active==='matches',onClick:()=>state.openModule('follow')},
 {icon:<Settings2 size={21}/>,label:state.admin?'设置':'账号设置',active:state.active==='settings'||state.active==='accounts',onClick:()=>state.openModule(state.admin?'settings':'accounts')}
 ]}/></nav></>;
}
