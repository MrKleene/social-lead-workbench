import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api,send} from '@/lib/api';
import {useAuth} from '@/features/auth/use-auth';
import {useConfirmWorkspaceLeave} from '@/features/work/draft-guard';
import {useMcpReadiness} from '@/features/collection/use-collection';
import {useAccountCenter} from './use-accounts';
import {loginAvailability} from './login-availability';
import type {LoginCapabilities} from './account-login-panel';
import type {Account} from './types';
export type AccountPanel='login'|'recover'|'settings'|'device'|'simulation'|null;
export function useAccountScreen(){
 const state=useAccountCenter(),admin=useAuth().user?.role==='ADMIN',client=useQueryClient(),confirmLeave=useConfirmWorkspaceLeave();
 const caps=useQuery({queryKey:['account-login-capabilities'],queryFn:()=>api<LoginCapabilities>('/accounts/login-capabilities'),enabled:admin,retry:false,refetchInterval:10000});
 const readiness=useMcpReadiness(admin),availability=loginAvailability(caps.data,caps.isPending,caps.isError);
 const [panel,setPanel]=useState<AccountPanel>(null),[target,setTarget]=useState<Account|null>(null),[adding,setAdding]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(0);
 const busy=useRef(false),returnFocus=useRef<HTMLElement|null>(null);
 const account=state.query.data?.accounts.find(a=>a.id===target?.id)||target||state.account;
 const open=async(next:AccountPanel,a=state.account)=>{if(!await confirmLeave())return;if(!panel)returnFocus.current=document.activeElement as HTMLElement;setTarget(a||null);setPanel(next);};
 const close=async()=>{if(state.mutation.isPending||!await confirmLeave())return;setPanel(null);};
 const add=async()=>{if(busy.current||!await confirmLeave())return;if(busy.current)return;if(availability!=='ready'){void open('device');return;}
  returnFocus.current=document.activeElement as HTMLElement;busy.current=true;setAdding(true);setError('');
  try{const a=await send<Account>('/accounts','POST',{platform:'XHS',label:'小红书 · 待扫码',ownerId:null,dailyLimit:10});state.select(a.id);setTarget(a);setPanel('login');await client.invalidateQueries({queryKey:['accounts']});}
  catch(e){setError(e instanceof Error?e.message:'添加失败，请重试');}finally{busy.current=false;setAdding(false);}
 };
 const rows=state.query.data?.accounts||[];
 const ready=availability==='ready'&&caps.data?.mode==='real'&&!readiness.isError?rows.filter(a=>a.loginProvider==='real'&&readiness.data?.accounts?.some(x=>x.id===a.id&&x.eligible)).length:0;
 const select=async(id:string)=>{if(await confirmLeave())state.select(id);};
 const archive=async()=>{if(account&&await confirmLeave())state.mutation.mutate({path:`/accounts/${account.id}`,method:'DELETE',body:{version:account.version}},{onSuccess:()=>setPanel(null)});};
 return {select,archive,state,admin,caps,availability,panel,account,rows,ready,adding,error,saved,returnFocus,open,close,add,finish:()=>setPanel(null),savedEditor:()=>setSaved(n=>n+1)};
}
