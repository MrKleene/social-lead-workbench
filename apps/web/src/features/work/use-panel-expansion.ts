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
  const target=active||from;
  const source=root.querySelector<HTMLElement>(target==='archive'?'.orbit-archive-satellite':target==='settings'?'.orbit-search':target==='accounts'?'.orbit-account':'.orbit-main');
  const box=el.getBoundingClientRect(),card=source?.getBoundingClientRect();
  const folded=card?`inset(${Math.max(0,card.top-box.top)}px ${Math.max(0,box.right-card.right)}px ${Math.max(0,box.bottom-card.bottom)}px ${Math.max(0,card.left-box.left)}px round 28px)`:'inset(35% 30% round 28px)';
  const running=animation.current?.playState==='running';
  const current=running?getComputedStyle(el).clipPath:undefined;
  animation.current?.cancel();
  if(reduced||!el.animate||!!from===!!active){el.style.visibility=active?'visible':'hidden';el.style.clipPath='none';return;}
  el.style.visibility='visible';
  const a=el.animate([{clipPath:current||(active?folded:'inset(0px round 28px)'),opacity:active?.92:1},{clipPath:active?'inset(0px round 28px)':folded,opacity:active?1:0}],{duration:active?460:320,easing:'cubic-bezier(.2,.75,.15,1)',fill:'forwards'});
  animation.current=a;
  a.onfinish=()=>{if(animation.current!==a)return;el.style.visibility=active?'visible':'hidden';el.style.clipPath='none';a.cancel();animation.current=null;};
 },[active,reduced]);
 useLayoutEffect(()=>()=>animation.current?.cancel(),[]);
 return {stage,surface};
}
