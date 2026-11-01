import {Link} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {ErrorNotice} from '@/components/feedback';
import {accountName,accountRemark} from './account-presentation';
import {accountStatusView} from './account-status';
import {useAccountScreen} from './use-account-screen';

type Screen = ReturnType<typeof useAccountScreen>;
export function AccountWorkspace({screen:s}:{screen:Screen}) {
 const ready=s.availability==='ready';
 const context={admin:s.admin,readiness:s.readiness.data,contact:s.contact.data,readError:s.readiness.isError,replyError:s.contact.isError,loading:s.readiness.isPending||s.contact.isPending};
 const count=s.state.query.isPending?'正在读取':s.state.query.isError?'读取失败':`${s.rows.length} 个账号`;
 return <div className="account-list-view">
  <header className="account-list-heading"><div><h1>账号中心</h1><span>{count}</span></div>{s.admin&&<div className="account-list-tools"><Button variant="ghost" onClick={()=>s.open('device')}>设备设置</Button><Button disabled={s.adding||s.caps.isPending} onClick={()=>void s.add()}>{s.adding?'添加中…':'＋ 添加账号'}</Button></div>}</header>

  {s.admin&&!ready&&<div className="candidate-notice" role="status"><span>{s.availability==='loading'?'正在检查登录服务…':s.availability==='error'?'暂时无法读取登录服务':s.availability==='device-required'?'首次使用，请先绑定执行电脑':s.availability==='device-unavailable'?'执行电脑离线或尚未认证':'扫码登录暂不可用'}</span><Button variant="outline" onClick={()=>s.availability==='error'?void s.caps.refetch():s.open('device')}>{s.availability==='error'?'重试':'查看设置'}</Button></div>}
  <ErrorNotice error={s.state.query.error||s.state.mutation.error}/>
  {s.state.query.isError&&<Button variant="outline" onClick={()=>void s.state.query.refetch()}>重新读取账号</Button>}
  {s.error&&<p className="candidate-notice" role="alert">{s.error}</p>}
  {s.state.query.isPending?<div className="candidate-empty" role="status" aria-label="正在读取账号"><Spinner/><p>正在读取账号…</p></div>:s.state.query.isError&&!s.rows.length?null:!s.rows.length?<div className="candidate-empty"><h2>{s.admin?'添加你的第一个账号':'暂无分配给你的账号'}</h2><p>{s.admin?'扫码确认后，登录信息保留在执行电脑。':'请联系管理员分配账号。'}</p></div>:<ul className="account-compact-list" aria-label="账号列表">{s.rows.map(a=>{
   const status=accountStatusView(a,context),name=accountName(a),remark=accountRemark(a);
   return <li className="account-compact-row" key={a.id}>
    <div className="account-identity"><span className="account-platform">{a.platform==='XHS'?'小红书':'抖音'}{a.isDemo?' · 模拟账号':''}</span><h2>{name}</h2>{remark&&remark!==name&&<p>{remark}</p>}</div>
    <dl className="account-compact-status"><div><dt>登录</dt><dd>{status.login}</dd></div><div><dt>风险</dt><dd data-warning={!!status.issue}>{status.risk}</dd></div><div><dt>采集</dt><dd>{status.collection}</dd></div><div><dt>回复</dt><dd>{status.reply}</dd></div></dl>
    <div className="account-compact-quota"><span>今日已占用 / 日上限</span><strong>{a.occupied}<span> / {a.dailyLimit}</span></strong></div>
    <div className="account-compact-actions"><Button variant="outline" onClick={()=>s.open('details',a)}>详情</Button>{s.admin&&<Button variant="ghost" onClick={()=>s.open('settings',a)}>设置</Button>}</div>
    {status.unknown>0&&<div className="account-compact-alert" role="alert"><Link to="/reply-history">{status.unknown} 条回复结果待核查 · 仍占用额度，勿重发 →</Link></div>}

   </li>;
  })}</ul>}
  {s.admin&&(s.readiness.isError||s.contact.isError)&&<Button variant="outline" onClick={()=>{void s.readiness.refetch();void s.contact.refetch();}}>重试读取资格</Button>}
 </div>;
}
