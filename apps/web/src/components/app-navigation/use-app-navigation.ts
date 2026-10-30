import {useLayoutEffect,useRef} from 'react';
import {useLocation} from 'react-router-dom';
import {activeNavigation,isWorkPath,navigationPath,primaryNavigation,secondaryNavigation,type NavigationItem} from './navigation-model';
export function useAppNavigation(admin:boolean){
 const location=useLocation(),history=useRef<Record<string,string>>({}),lastWorkSearch=useRef(''),scroll=useRef<HTMLElement>(null);
 const active=activeNavigation(location.pathname,location.search,admin),visible=(item:NavigationItem)=>!item.adminOnly||admin;
 const primary=primaryNavigation.filter(visible),secondary=secondaryNavigation.filter(visible),currentSecondary=secondary.find(item=>item.id===active);
 useLayoutEffect(()=>{if(isWorkPath(location.pathname)||location.pathname==='/automation'){lastWorkSearch.current=location.search;if(active&&active!=='overview')history.current[active]=location.pathname+location.search;}},[active,location.pathname,location.search]);
 useLayoutEffect(()=>{
  const nav=scroll.current;if(!nav)return;
  const reveal=()=>{const selected=nav.querySelector<HTMLElement>('[aria-current=page]');if(!selected)return;const frame=nav.getBoundingClientRect(),item=selected.getBoundingClientRect(),padding=6;
   if(item.left<frame.left+padding)nav.scrollLeft-=frame.left+padding-item.left;else if(item.right>frame.right-padding)nav.scrollLeft+=item.right-frame.right+padding;
  };
  reveal();const observer=new ResizeObserver(reveal);observer.observe(nav);return()=>observer.disconnect();
 },[active]);
 return {primary,secondary,active,currentSecondary,scroll,locationKey:location.key,href:(item:NavigationItem)=>item.id===active&&item.id!=='overview'?location.pathname+location.search:navigationPath(item,location,history.current,lastWorkSearch.current)};
}
