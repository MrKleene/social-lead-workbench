import {Fragment} from 'react';
import {Link} from 'react-router-dom';
import {Plus,AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
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
  <header className="account-list-heading"><div><h1>账号中心</h1><span>{count}</span></div>{s.admin&&<div className="account-list-tools"><Button variant="outline" onClick={()=>s.open('device')}>设备设置</Button><Button disabled={s.adding||s.caps.isPending} onClick={()=>void s.add()}>{s.adding?<Spinner/>:<Plus data-icon="inline-start"/>}{s.adding?'添加中…':'添加账号'}</Button></div>}</header>
  {s.admin&&!ready&&<Alert className="account-service-notice" role="status"><AlertCircle/><AlertDescription><span>{s.availability==='loading'?'正在检查登录服务…':s.availability==='error'?'暂时无法读取登录服务':s.availability==='device-required'?'首次使用，请先绑定执行电脑':s.availability==='device-unavailable'?'执行电脑离线或尚未认证':'扫码登录暂不可用'}</span><Button variant="outline" size="sm" onClick={()=>s.availability==='error'?void s.caps.refetch():s.open('device')}>{s.availability==='error'?'重试':'查看设置'}</Button></AlertDescription></Alert>}
  <ErrorNotice error={s.state.query.error||s.state.mutation.error}/>
  {s.state.query.isError&&<Button variant="outline" onClick={()=>void s.state.query.refetch()}>重新读取账号</Button>}
  {s.error&&<Alert variant="destructive" role="alert"><AlertDescription>{s.error}</AlertDescription></Alert>}
  {s.state.query.isPending?<div className="account-list-empty" role="status" aria-label="正在读取账号"><Spinner/><p>正在读取账号…</p></div>:s.state.query.isError&&!s.rows.length?null:!s.rows.length?<div className="account-list-empty"><h2>{s.admin?'添加你的第一个账号':'暂无分配给你的账号'}</h2>{!s.admin&&<p>请联系管理员分配账号。</p>}</div>:<Table className="account-table" aria-label="账号列表">
   <TableHeader><TableRow><TableHead scope="col">昵称</TableHead><TableHead scope="col">登录</TableHead><TableHead scope="col">采集能力</TableHead><TableHead scope="col">回复能力</TableHead><TableHead scope="col">日额度<small>已占用 / 日上限</small></TableHead><TableHead scope="col">操作</TableHead></TableRow></TableHeader>
   <TableBody>{s.rows.map(a=>{
    const status=accountStatusView(a,context),name=accountName(a),remark=accountRemark(a);
    const loginProblem=['EXPIRED','MISSING','DEVICE_MISMATCH','NEEDS_REVIEW','RESTRICTED'].includes(a.loginStatus||'');
    return <Fragment key={a.id}><TableRow className="account-table-row">
     <TableCell className="account-identity"><strong>{name}</strong><small>{a.platform==='XHS'?'小红书':'抖音'}{a.isDemo?' · 模拟账号':''}{remark&&remark!==name?` · ${remark}`:''}</small></TableCell>
     <TableCell className="account-login-cell" data-label="登录"><Badge variant="secondary" data-tone={loginProblem?'danger':'neutral'}>{status.login}</Badge></TableCell>
     <TableCell data-label="采集能力"><Badge variant="secondary">{status.collection}</Badge></TableCell>
     <TableCell data-label="回复能力"><Badge variant="secondary" data-tone={status.issue?'danger':'neutral'}>{status.reply}</Badge>{status.issue&&<small className="account-risk-reason">{status.risk}</small>}</TableCell>
     <TableCell className="account-quota-cell" data-label="日额度"><span>{a.occupied}<span className="account-quota-separator"> / </span>{a.dailyLimit}</span></TableCell>
     <TableCell className="account-row-actions"><Button variant="ghost" size="sm" aria-label={`查看${name}详情`} onClick={()=>s.open('details',a)}>详情</Button>{s.admin&&<Button variant="ghost" size="sm" aria-label={`设置${name}`} onClick={()=>s.open('settings',a)}>设置</Button>}</TableCell>
    </TableRow>{status.unknown>0&&<TableRow className="account-unknown-row"><TableCell colSpan={6}><Alert className="account-unknown" role="alert"><AlertCircle/><AlertDescription><span>{name} · {status.unknown} 条回复结果未知，仍占用额度，核查前勿重发。</span><Link to="/reply-history">核查记录</Link></AlertDescription></Alert></TableCell></TableRow>}</Fragment>;
   })}</TableBody>
  </Table>}
  {s.admin&&(s.readiness.isError||s.contact.isError)&&<Button variant="outline" onClick={()=>{void s.readiness.refetch();void s.contact.refetch();}}>重试读取资格</Button>}
 </div>;
}
