import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi,type LocalMethods} from './local-api';
export function useLocalRecords<K extends keyof LocalMethods>(method:K,input?:unknown){return useQuery({queryKey:['local',method,input??null],queryFn:()=>localApi(method,input),refetchInterval:5000});}
export function useLocalAction<K extends keyof LocalMethods>(method:K){const client=useQueryClient();return useMutation({mutationFn:(input:unknown)=>localApi(method,input),onSuccess:()=>client.invalidateQueries({queryKey:['local']})});}
