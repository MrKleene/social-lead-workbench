import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
/** Mounted panels preserve unsaved drafts; inactive panels are immediately inert. */
export function SpacePanel({active,name,children}:{active:boolean;name:string;children:ReactNode}) {
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{if(!active&&ref.current?.contains(document.activeElement))(document.querySelector<HTMLElement>('.aurora-dock-active, .space-node.selected')||document.querySelector<HTMLElement>('.core-start'))?.focus();},[active]);
 return <div ref={ref} className="space-panel" data-active={active} data-panel={name} inert={!active} aria-hidden={!active}>{children}</div>;
}
/** One outgoing surface, latest destination wins; no stacked copies or stale timers. */
export function SoftSwap({identity,children}:{identity:string;children:ReactNode}) {
 const [shown,setShown]=useState(identity), previous=useRef(children), ref=useRef<HTMLDivElement>(null);
 const focusAfter=useRef(false);
 useLayoutEffect(()=>{if(shown===identity)previous.current=children;},[shown,identity,children]);
 useEffect(()=>{
  if(shown===identity)return;
  focusAfter.current=!!ref.current?.contains(document.activeElement)||(document.activeElement===document.body&&ref.current?.closest('.space-panel')?.getAttribute('data-active')==='true');
  const reduced=document.documentElement.dataset.crmReduced==='true';
  const timer=window.setTimeout(()=>setShown(identity),reduced?0:160);
  return()=>window.clearTimeout(timer);
 },[identity,shown]);
 useLayoutEffect(()=>{if(shown===identity&&focusAfter.current){ref.current?.querySelector<HTMLElement>('input,textarea,button,a,[tabindex]')?.focus();focusAfter.current=false;}},[shown,identity]);
 return <div ref={ref} className="space-soft-swap" data-exiting={shown!==identity} inert={shown!==identity}>{shown===identity?children:previous.current}</div>;
}
