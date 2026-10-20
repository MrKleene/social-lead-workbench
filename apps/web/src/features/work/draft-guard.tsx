import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { shouldProtectDrafts } from './navigation-policy';
type DraftKind = 'retained' | 'lead';
const DraftContext = createContext<{ drafts: Map<symbol,DraftKind>; confirmLeave:()=>boolean } | null>(null);
export function DraftGuardProvider({children}:{children:ReactNode}) {
 const drafts=useRef(new Map<symbol,DraftKind>()).current;
 const confirmLeave=useCallback(()=>!drafts.size||window.confirm('还有未保存的修改。离开会丢弃这些修改，确定离开吗？'),[drafts]);
 const blocker=useBlocker(({currentLocation,nextLocation})=>shouldProtectDrafts([...drafts.values()],currentLocation.pathname,nextLocation.pathname));
 useEffect(()=>{if(blocker.state==='blocked'){if(confirmLeave())blocker.proceed();else blocker.reset();}},[blocker,confirmLeave]);
 useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(drafts.size){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[drafts]);
 return <DraftContext.Provider value={{drafts,confirmLeave}}>{children}</DraftContext.Provider>;
}
export function useDraftGuard(dirty:boolean,kind:DraftKind='retained') {
 const context=useContext(DraftContext), token=useRef(Symbol('draft')).current;
 useEffect(()=>{if(dirty)context?.drafts.set(token,kind);else context?.drafts.delete(token);return()=>{context?.drafts.delete(token);};},[context?.drafts,token,dirty,kind]);
 return ()=>!dirty||window.confirm('当前编辑尚未保存。确定放弃修改并切换吗？');
}
export function useConfirmWorkspaceLeave(){return useContext(DraftContext)?.confirmLeave||(()=>true);}
