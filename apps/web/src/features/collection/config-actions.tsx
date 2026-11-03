import {useRef,useState} from 'react';
import {DropdownMenu} from 'radix-ui';
import {MoreHorizontal} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import type {Config} from './types';

export function ConfigActions({config,disabled,onToggle,onArchive}:{config:Config;disabled:boolean;onToggle:()=>void;onArchive:()=>void}) {
    const [confirm,setConfirm]=useState(false),trigger=useRef<HTMLButtonElement>(null),opening=useRef(false);
    return <><DropdownMenu.Root onOpenChange={open=>{if(open)opening.current=false;}}><DropdownMenu.Trigger asChild><Button ref={trigger} variant="ghost" size="icon" disabled={disabled} aria-label={`${config.name} 更多操作`}><MoreHorizontal/></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="review-actions-menu" align="end" sideOffset={4} onCloseAutoFocus={e=>{if(opening.current)e.preventDefault();}}><DropdownMenu.Group>
        <DropdownMenu.Item className="review-actions-item" onSelect={onToggle}>{config.enabled?'暂停':'启用'}</DropdownMenu.Item>
        <DropdownMenu.Item className="review-actions-item" onSelect={()=>{opening.current=true;setConfirm(true);}}>归档</DropdownMenu.Item>
    </DropdownMenu.Group></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    <AlertDialog open={confirm} onOpenChange={setConfirm}>{confirm&&<AlertDialogContent onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}}><AlertDialogHeader><AlertDialogTitle>归档关键词配置？</AlertDialogTitle><AlertDialogDescription>“{config.name}”将不再用于新采集，已有历史保留。{config.activeRunId?'当前采集也会暂停。':''}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction disabled={disabled} onClick={onArchive}>确认归档</AlertDialogAction></AlertDialogFooter></AlertDialogContent>}</AlertDialog></>;
}
