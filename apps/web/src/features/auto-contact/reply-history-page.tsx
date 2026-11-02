import {Button} from '@/components/ui/button';
import {Link} from 'react-router-dom';
import {useAuth} from '@/features/auth/use-auth';
import {ReplyHistory} from './reply-history';
import './auto-contact.css';
export function ReplyHistoryPage() {
    const {user}=useAuth();
    if(user?.role!=='ADMIN')return <p>回复记录仅管理员可查看。<Link to="/work">返回工作台</Link></p>;
    return <section className="auto-contact-page reply-history-page"><header className="contact-heading"><div><h1>回复记录</h1></div><div className="action-row"><Button variant="outline" size="sm" asChild><Link to="/auto-contact?view=pending">待处理回复</Link></Button><Button variant="outline" size="sm" asChild><Link to="/comment-review">评论审核</Link></Button><Button variant="outline" size="sm" asChild><Link to="/auto-contact">自动回复</Link></Button></div></header><ReplyHistory enabled/></section>;
}
