import type {ReactNode} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {DraftGuardProvider} from '@/features/work/draft-guard';
import '../accounts/account-candidate.css';
import './representatives.css';
const links=[['/home','启动配置'],['/work','项目概览'],['/design-preview/automation','自动化任务'],['/design-preview/accounts','账号中心']];
export function PreviewShell({children}:{children:ReactNode}){
 const {pathname}=useLocation();
 return <DraftGuardProvider><div className="candidate-preview"><div className="candidate-preview-note">UI 系统 v0.3 · 虚构数据 · 本地交互验证 <a href="https://pixso.net/app/design/j2o5jzrX8EQ5qNOP6zlc5A" target="_blank" rel="noreferrer">早期 Pixso 参考稿 ↗</a><Link to="/design-preview/components">组件与状态</Link></div><header className="candidate-nav"><Link to="/design-preview/accounts" className="candidate-brand">Social Lead<span>工作台</span></Link><nav aria-label="预览导航">{links.map(([path,label])=><Link key={path} to={path} aria-current={pathname===path?'page':undefined}>{label}</Link>)}</nav></header><main>{children}</main></div></DraftGuardProvider>;
}
