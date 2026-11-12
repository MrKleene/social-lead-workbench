import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi,type LocalMethods} from './local-api';
/**
 * 读取本机数据。默认 5 秒轮询；需要更快（例如步骤条要跟着任务状态走）时传
 * `refetchInterval`。`enabled` 用于「还没有轮次时不要发请求」这类场景。
 */
export function useLocalRecords<K extends keyof LocalMethods>(
  method:K,
  input?:unknown,
  options?:{refetchInterval?:number;enabled?:boolean},
){
  return useQuery({
    queryKey:['local',method,input??null],
    queryFn:()=>localApi(method,input),
    refetchInterval:options?.refetchInterval??5000,
    enabled:options?.enabled??true,
  });
}
export function useLocalAction<K extends keyof LocalMethods>(method:K){const client=useQueryClient();return useMutation({mutationFn:(input:unknown)=>localApi(method,input),onSuccess:()=>client.invalidateQueries({queryKey:['local']})});}
