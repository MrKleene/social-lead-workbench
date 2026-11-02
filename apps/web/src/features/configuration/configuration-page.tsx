import {Link,Navigate,useNavigate,useSearchParams} from 'react-router-dom';
import {useAuth} from '@/features/auth/use-auth';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {CollectionPage} from '@/features/collection/collection-page';
import {PolicyConfigurationPage} from '@/features/comment-review/policy-configuration-page';
import {RepliesPage} from '@/features/replies/replies-page';
import {configurationPath,configurationTab,configurationTabs,type ConfigurationTab} from './configuration-route';
import './configuration.css';
export function LegacyConfiguration({tab}:{tab:ConfigurationTab}){const [params]=useSearchParams();return <Navigate replace to={configurationPath(tab,params.toString())}/>;}
export function ConfigurationPage(){
 const {user}=useAuth(),[params]=useSearchParams(),navigate=useNavigate(),tab=configurationTab(params.toString());
 if(user?.role!=='ADMIN')return <p>仅管理员可管理配置。<Link to="/work">返回工作台</Link></p>;
 return <Tabs className="configuration-page" value={tab} activationMode="manual" onValueChange={value=>navigate(configurationPath(value as ConfigurationTab,params.toString()))}><TabsList variant="line" className="configuration-tabs" aria-label="配置分类">{configurationTabs.map(item=><TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList><TabsContent value="keywords"><CollectionPage/></TabsContent><TabsContent value="matching"><PolicyConfigurationPage/></TabsContent><TabsContent value="templates"><RepliesPage/></TabsContent></Tabs>;
}
