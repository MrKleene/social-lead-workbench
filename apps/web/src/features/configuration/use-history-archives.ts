import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '@/lib/api';
export type HistoryArchive={id:string;createdAt:string;restoredAt:string|null;counts:Record<string,number>};
export function useHistoryArchives(open:boolean){
 const client=useQueryClient();
 const query=useQuery({queryKey:['history-archives'],queryFn:()=>api<HistoryArchive[]>('/history-archives'),enabled:open,retry:false});
 const restore=useMutation({mutationFn:(id:string)=>api<HistoryArchive>(`/history-archives/${encodeURIComponent(id)}/restore`,{method:'POST',body:JSON.stringify({consent:'RESTORE_DISPLAY_ONLY_NO_SEND'})}),onSuccess:async()=>{await client.invalidateQueries();}});
 return {query,restore};
}
