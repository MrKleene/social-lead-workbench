import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { send } from '@/lib/api';
export function useSavedSession(accountId:string){
  const [consent,setConsent]=useState(false),client=useQueryClient();
  const verify=useMutation({mutationFn:()=>send<{state:string;provider:string}>(`/accounts/${accountId}/session/verify`,'POST',{consent:'read-local-session-v1'}),onSettled:()=>{setConsent(false);void Promise.all(['accounts','mcp-readiness'].map(key=>client.invalidateQueries({queryKey:[key]})));}});
  return {consent,setConsent,verify};
}
