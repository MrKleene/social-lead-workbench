import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, send } from '@/lib/api';
export type DeviceState={enabled:boolean;provider?:string;candidateId?:string;allowedBase?:string;suggestedRoot?:string;capability:{os:string;supported:boolean;adapter:string;remote:false};device:null|{id:string;name:string;os:string;enabled:boolean;online:boolean;credentialRoot:string;keyFingerprint:string;version:number;accountCount:number;lastSeenAt:string|null}};
export function useDeviceSettings(){
  const client=useQueryClient(),query=useQuery({queryKey:['execution-device'],queryFn:()=>api<DeviceState>('/devices'),refetchInterval:10000});
  const mutation=useMutation({mutationFn:({path,body,method='POST'}:{path:string;body:unknown;method?:'POST'|'PATCH'})=>send<DeviceState>(path,method,body),onSuccess:data=>{client.setQueryData(['execution-device'],data);void client.invalidateQueries({queryKey:['account-login-capabilities']});void client.invalidateQueries({queryKey:['accounts']});}});
  return {query,mutation};
}
