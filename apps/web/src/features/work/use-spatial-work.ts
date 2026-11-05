import {useConfig,useConfigs} from '@/features/collection/use-collection';
import {useAutomationPreferences} from './settings-data';
import {useNavigate,useParams,useSearchParams,useLocation} from 'react-router-dom';
import {useAuth} from '@/features/auth/use-auth';
import {activeWorkModule,type SpaceModule} from './navigation-policy';
export type {SpaceModule} from './navigation-policy';
export function useSpatialWork(){
 const {user}=useAuth(),admin=user?.role==='ADMIN';
 const [params,setParams]=useSearchParams(),{id}=useParams(),navigate=useNavigate(),location=useLocation();
 const configsQuery=useConfigs(admin),preferences=useAutomationPreferences(admin);
 const currentConfigs=configsQuery.data||[];
 const historyConfig=useConfig(admin&&params.get('run')&&!currentConfigs.some(c=>c.id===params.get('config'))?params.get('config')||undefined:undefined);
 const configs=historyConfig.data&&!currentConfigs.some(c=>c.id===historyConfig.data.id)?[...currentConfigs,historyConfig.data]:currentConfigs;
 const selectedConfig=configs.find(c=>c.id===params.get('config'))||configs.find(c=>c.id===preferences.data?.configId)||configs.find(c=>c.enabled)||configs[0];
 const active=location.pathname==='/automation'?'runs':activeWorkModule(params.toString(),id,admin);
 const openModule=(module:SpaceModule,config?:string)=>{const p=new URLSearchParams(params);p.set('module',module);if(config)p.set('config',config);p.delete('view');navigate(`${module==='runs'?'/automation':'/work'}?${p}`);};
 return {admin,id,active,work:{configs:configsQuery},configs,selectedConfig,openModule,setConfig:(config:string)=>setParams(p=>{p.set('config',config);p.delete('run');p.delete('fresh');return p;})};
}
export type SpatialState=ReturnType<typeof useSpatialWork>;
