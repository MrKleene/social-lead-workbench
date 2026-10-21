import { Search, Database, ScanLine, MessagesSquare, ContactRound, UsersRound, House, Bell } from 'lucide-react';
import Dock from '@/vendor/react-bits/Dock';
import { useAuroraReduced } from './aurora-motion';
import type { SpatialState, SpaceModule } from './use-spatial-work';
const nodes = [
 {id:'runs',title:'采集任务',icon:Database,admin:true},
 {id:'matches',title:'评论审核',icon:ScanLine},
 {id:'follow',title:'销售跟进',icon:UsersRound},
 {id:'settings',title:'搜索与模型设置',icon:Search,admin:true},
 {id:'templates',title:'回复话术',icon:MessagesSquare,admin:true},
 {id:'accounts',title:'账号中心',icon:ContactRound},
 {id:'notices',title:'提醒与异常',icon:Bell},
] as const;
export function SpaceNavigation({state}:{state:SpatialState}) {
 const reduced=useAuroraReduced();
 return <>
  <nav className="aurora-capsule" aria-label="工作阶段">
   <button onClick={state.overview} aria-current={!state.active?'page':undefined}>工作舱</button>
   {(['runs','matches','follow'] as SpaceModule[]).filter(id=>state.admin||id!=='runs').map((id,i)=><button key={id} className={`space-node node-${id}${state.active===id?' selected':''}`} aria-current={state.active===id?'page':undefined} onClick={()=>state.openModule(id)}><span>0{i+1}</span>{id==='runs'?'发现':id==='matches'?'审核':'交接'}</button>)}
  </nav>
  <nav className="aurora-dock" aria-label="模块快捷导航"><Dock baseItemSize={42} magnification={reduced?42:56} panelHeight={62} gap={8} bounce={!reduced} accentColor="#b9f36d" items={[
   {icon:<House size={19}/>,label:'返回工作舱',active:!state.active,onClick:state.overview},
   ...nodes.filter(n=>!('admin' in n)||state.admin).map(n=>({icon:<n.icon size={19}/>,label:n.title,active:state.active===n.id,className:state.active===n.id?'aurora-dock-active':undefined,onClick:()=>state.openModule(n.id)}))
  ]}/></nav>
 </>;
}
