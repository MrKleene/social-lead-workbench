import {Link} from 'react-router-dom';
import {useAuth} from '@/features/auth/use-auth';
import {ReplyHistory} from './reply-history';
import './auto-contact.css';
export function ReplyHistoryPage() {
    const {user}=useAuth();
    if(user?.role!=='ADMIN')return <p>回复记录仅管理员可查看。<Link to="/work">返回工作台</Link></p>;
    return <section className="auto-contact-page"><header className="contact-heading"><div><h1>回复记录</h1><p>查看我们已发出的回复及执行结果，不包含对方后续回复。</p></div><div className="action-row"><Link to="/comment-review">评论审核</Link><Link to="/auto-contact">自动联系与账号矩阵</Link></div></header><ReplyHistory enabled/></section>;
}
