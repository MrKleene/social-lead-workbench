import {Link,useSearchParams} from 'react-router-dom';
import {useAuth} from '@/features/auth/use-auth';
import {PageState} from '@/components/page-state';
import {useReviewOverview} from './use-comment-review';
import {PolicyManager} from './policy-manager';
export function PolicyConfigurationPage(){
 const {user}=useAuth(),[params]=useSearchParams(),query=useReviewOverview(user?.role==='ADMIN');
 if(user?.role!=='ADMIN')return <p>仅管理员可管理匹配方案。<Link to="/work">返回工作台</Link></p>;
 if(query.isPending)return <PageState title="评论匹配方案配置" loading/>;
 if(query.isError||!query.data)return <PageState title="评论匹配方案配置" error={query.error} onRetry={()=>void query.refetch()}/>;
 return <PolicyManager overview={query.data} initialId={params.get('policy')||undefined}/>;
}
