import {changingConfigurationTab} from '@/features/configuration/configuration-route';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from '@/lib/router-compat';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { shouldProtectDrafts } from './navigation-policy';
type DraftKind = 'retained' | 'modal' | 'pending';
const DraftContext = createContext<{ drafts: Map<symbol,DraftKind>; confirmLeave:()=>Promise<boolean>; confirm:(message:string)=>Promise<boolean> } | null>(null);
export function DraftGuardProvider({children}:{children:ReactNode}) {
 const drafts=useRef(new Map<symbol,DraftKind>()).current;
 const pending=useRef<{resolve:(value:boolean)=>void;promise:Promise<boolean>;trigger:HTMLElement|null}|null>(null);
 const returnFocus=useRef<HTMLElement|null>(null);
 const [question,setQuestion]=useState(''),[open,setOpen]=useState(false);
 const confirm=useCallback((message:string)=>{
  if(pending.current)return Promise.resolve(false);
  let resolve!:(value:boolean)=>void;const promise=new Promise<boolean>(done=>{resolve=done;});
  pending.current={resolve,promise,trigger:document.activeElement instanceof HTMLElement?document.activeElement:null};returnFocus.current=pending.current.trigger;setQuestion(message);setOpen(true);return promise;
 },[]);
 const finish=(answer:boolean)=>{const request=pending.current;pending.current=null;setOpen(false);request?.resolve(answer);request?.trigger?.focus({preventScroll:true});};
 const confirmLeave=useCallback(async()=>[...drafts.values()].includes('pending')?false:!drafts.size||await confirm('还有未保存的修改。离开会丢弃这些修改，确定离开吗？'),[drafts,confirm]);
 const blocker=useBlocker(({currentLocation,nextLocation})=>drafts.size>0&&changingConfigurationTab(currentLocation,nextLocation)||[...drafts.values()].some(kind=>kind==='modal'||kind==='pending')&&(currentLocation.pathname+currentLocation.search+currentLocation.hash!==nextLocation.pathname+nextLocation.search+nextLocation.hash)||shouldProtectDrafts([...drafts.values()].filter((kind):kind is 'retained'=>kind==='retained'),currentLocation.pathname,nextLocation.pathname)||drafts.size>0&&currentLocation.pathname==='/work'&&nextLocation.pathname==='/work'&&['run','policy'].some(key=>new URLSearchParams(currentLocation.search).get(key)!==new URLSearchParams(nextLocation.search).get(key)));
 const deciding=useRef(false);
 useEffect(()=>{if(blocker.state==='blocked'&&!deciding.current){deciding.current=true;void confirmLeave().then(leave=>{if(leave)blocker.proceed();else blocker.reset();deciding.current=false;});}},[blocker,confirmLeave]);
 useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(drafts.size){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[drafts]);
 useEffect(()=>()=>{pending.current?.resolve(false);pending.current=null;},[]);
 return <DraftContext.Provider value={{drafts,confirmLeave,confirm}}>{children}<AlertDialog open={open} onOpenChange={next=>{if(!next)finish(false);}}><AlertDialogContent onCloseAutoFocus={event=>{event.preventDefault();if(returnFocus.current?.isConnected)returnFocus.current.focus({preventScroll:true});}}><AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>{question}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={()=>finish(false)}>继续编辑</AlertDialogCancel><AlertDialogAction onClick={()=>finish(true)}>放弃修改</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DraftContext.Provider>;
}
export function useDraftGuard(dirty:boolean,kind:DraftKind='retained') {
 const context=useContext(DraftContext), token=useRef(Symbol('draft')).current;
 useEffect(()=>{if(dirty)context?.drafts.set(token,kind);else context?.drafts.delete(token);return()=>{context?.drafts.delete(token);};},[context?.drafts,token,dirty,kind]);
 return async()=>!dirty||await context?.confirm('当前编辑尚未保存。确定放弃修改并切换吗？')===true;
}
export function useConfirmWorkspaceLeave(){return useContext(DraftContext)?.confirmLeave|| (async()=>true);}
export function useConfirmDiscard(){return useContext(DraftContext)?.confirm|| (async()=>false);}
