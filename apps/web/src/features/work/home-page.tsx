import {useAuth} from '@/features/auth/use-auth';
import {OrbitOverview} from './orbit-overview';
import {HomeCollectionActions} from './home-collection-actions';
export function HomePage(){
 const {user}=useAuth(),admin=user?.role==='ADMIN';
 return <div className="spatial-work" data-expanded="false" data-module="home"><OrbitOverview admin={admin} actions={admin?<HomeCollectionActions/>:undefined}/></div>;
}
