import { useEffect, useLayoutEffect, useRef } from 'react';
import type { SpaceModule } from './use-spatial-work';
import { useAuroraReduced } from './aurora-motion';
/** Expand the same retained DOM surface; cancellation starts from its current shape. */
export function usePanelExpansion(active:SpaceModule|null) {
 const stage=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null);
 const animation=useRef<Animation|null>(null),previous=useRef<SpaceModule|null>(null);
 const reduced=useAuroraReduced();
 const scrollByModule=useRef(new Map<string,number>()),scrollKey=useRef(active||'overview');
 useEffect(()=>{const remember=()=>scrollByModule.current.set(scrollKey.current,window.scrollY);window.addEventListener('scroll',remember,{passive:true});return()=>window.removeEventListener('scroll',remember);},[]);
 useLayoutEffect(()=>{scrollKey.current=active||'overview';window.scrollTo({top:scrollByModule.current.get(scrollKey.current)||0,behavior:'instant'});},[active]);
 useLayoutEffect(()=>{
  const el=surface.current,root=stage.current;if(!el||!root)return;
  const from=previous.current;previous.current=active;
  if(active && !from && (document.activeElement===document.body || !!document.activeElement?.closest('.aurora-overview'))){
   const heading=el.querySelector<HTMLElement>('[data-active=true] h1,[data-active=true] h2');
   if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  }
  if(!from&&!active)return;
  animation.current?.cancel();
  el.style.visibility=active?'visible':'hidden';
  if(!active||reduced||!el.animate)return;
  const a=el.animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:180,easing:'ease-out'});
  animation.current=a;
  a.onfinish=()=>{if(animation.current===a)animation.current=null;};
 },[active,reduced]);
 useLayoutEffect(()=>()=>animation.current?.cancel(),[]);
 return {stage,surface};
}
