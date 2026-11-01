import {useAuth} from '@/features/auth/use-auth';
import {OrbitOverview} from './orbit-overview';
export function HomePage(){
 const {user}=useAuth();
 return <div className="spatial-work" data-expanded="false" data-module="home"><OrbitOverview admin={user?.role==='ADMIN'}/></div>;
}
