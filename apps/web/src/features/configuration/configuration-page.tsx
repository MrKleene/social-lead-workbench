import {Link,Navigate,useNavigate,useSearchParams} from 'react-router-dom';
import {useAuth} from '@/features/auth/use-auth';
import {Button} from '@/components/ui/button';
import {SelectField,SelectOption} from '@/components/select-field';
import {ModelConfigurationPage} from '@/features/model-settings/model-configuration-page';
import {CollectionPage} from '@/features/collection/collection-page';
import {PolicyConfigurationPage} from '@/features/comment-review/policy-configuration-page';
import {RepliesPage} from '@/features/replies/replies-page';
import {configurationPath,configurationTab,configurationTabs,type ConfigurationTab} from './configuration-route';
import './configuration.css';
export function LegacyConfiguration({tab}:{tab:ConfigurationTab}){const [params]=useSearchParams();return <Navigate replace to={configurationPath(tab,params.toString())}/>;}
export function ConfigurationPage(){
 const {user}=useAuth(),[params]=useSearchParams(),navigate=useNavigate(),tab=configurationTab(params.toString());
 if(user?.role!=='ADMIN')return <p>仅管理员可管理配置。<Link to="/work">返回工作台</Link></p>;
 return <div className="configuration-page"><nav className="configuration-navigation" aria-label="配置分类">{configurationTabs.map(item=><Button key={item.id} asChild variant="ghost" className="configuration-category"><Link aria-current={tab===item.id?'page':undefined} to={configurationPath(item.id,params.toString())}>{item.label}</Link></Button>)}</nav><div className="configuration-mobile-selector"><SelectField aria-label="配置分类" value={tab} onValueChange={value=>navigate(configurationPath(value as ConfigurationTab,params.toString()))}>{configurationTabs.map(item=><SelectOption key={item.id} value={item.id}>{item.label}</SelectOption>)}</SelectField></div><section className="configuration-content" aria-label={configurationTabs.find(item=>item.id===tab)?.label}>{tab==='keywords'?<CollectionPage/>:tab==='matching'?<PolicyConfigurationPage/>:tab==='templates'?<RepliesPage/>:<ModelConfigurationPage/>}</section></div>;
}
