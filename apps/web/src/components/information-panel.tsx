import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {Button} from './ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetTrigger} from './ui/sheet';
import {cn} from '@/lib/utils';
import './information-panel.css';

export {InfoSection} from './information-section';
type OverlayProps={title:ReactNode;children:ReactNode|((open:boolean)=>ReactNode);description?:string;className?:string;open?:boolean;onOpenChange?:(open:boolean)=>void;busy?:boolean;kind?:'drawer'|'dialog'};
/** Radix manages focus trapping, Escape, outside dismissal and trigger focus restoration. */
export function InfoDrawer({title,children,description='查看详情，不会自动执行操作。',className,open:controlled,onOpenChange,busy=false,kind='drawer'}:OverlayProps){
 const [local,setLocal]=useState(false),open=controlled??local;
 const location=useLocation(),lastRoute=useRef(location.key);
 useEffect(()=>{if(lastRoute.current!==location.key){lastRoute.current=location.key;setLocal(false);onOpenChange?.(false);}},[location.key,onOpenChange]);
 const change=(next:boolean)=>{if(!next&&busy)return;setLocal(next);onOpenChange?.(next);};
 return <div className={cn('information-entry',className)}><Sheet open={open} onOpenChange={change}><SheetTrigger asChild><Button type="button" variant="outline" className="information-trigger">{title}</Button></SheetTrigger><SheetContent className={cn('task-settings-sheet information-drawer',kind==='dialog'&&'information-dialog')} showCloseButton={!busy} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onPointerDownOutside={e=>{if(busy)e.preventDefault();}} onInteractOutside={e=>{if(busy)e.preventDefault();}}><SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader><div className="task-settings-body information-body">{typeof children==='function'?children(open):children}</div></SheetContent></Sheet></div>;
}
export function InfoDialog(props:Omit<OverlayProps,'kind'>){return <InfoDrawer {...props} kind="dialog"/>;}
