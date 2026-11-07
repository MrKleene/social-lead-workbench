import {Link} from 'react-router-dom';
import {Check} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useLocalWorkbench} from './use-local-workbench';
import {useLocalRecords} from './use-local-records';
import './local-start-panel.css';
export function LocalStartPanel({runs}:{runs:number|undefined}){
 const w=useLocalWorkbench(),accounts=useLocalRecords('accounts');
 if(w.status.data?.initialized)return null;
 if(accounts.isPending||w.configs.isPending)return null;
 const loggedIn=(accounts.data??[]).some(a=>a.state==='VERIFIED'),configured=(w.configs.data??[]).length>0,collected=(runs??0)>0;
 const steps=[
  {title:'登录小红书账号',detail:'扫码登录，会话由系统密钥库加密保存在本机。',done:loggedIn,to:'/work?module=accounts',action:'去登录'},
  {title:'保存关键词配置',detail:'决定这一轮采集哪些帖子、匹配哪些评论。',done:configured,to:'/configuration',action:'去配置'},
  {title:'跑通第一轮采集',detail:'范围、账号和审核目标确认后才会执行，每轮单独授权。',done:collected,to:'/automation',action:'去采集'},
 ];
 const done=steps.filter(s=>s.done).length;
 if(done===steps.length)return null;
 return <section className="start-panel" aria-labelledby="start-title">
  <header className="start-head"><div><h2 id="start-title">开始使用</h2><p>完成这三步后工作台才会有数据 · 已完成 {done} / {steps.length}</p></div><Button variant="ghost" size="sm" pending={w.initialize.isPending} onClick={()=>w.initialize.mutate()}>不再显示</Button></header>
  <ol className="start-steps">{steps.map((s,i)=><li key={s.title} data-done={s.done||undefined}><span className="start-mark" aria-hidden="true">{s.done?<Check/>:i+1}</span><div className="start-copy"><strong>{s.title}</strong><small>{s.detail}</small></div>{s.done?<span className="start-done">已完成</span>:<Button asChild variant="outline" size="sm"><Link to={s.to}>{s.action}</Link></Button>}</li>)}</ol>
 </section>;
}
