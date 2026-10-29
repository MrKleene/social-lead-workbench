import type {ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {Button} from './ui/button';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from './ui/collapsible';
export function SettingsDisclosure({title,children,defaultOpen=false}:{title:string;children:ReactNode;defaultOpen?:boolean}){
 return <Collapsible defaultOpen={defaultOpen} className="settings-disclosure"><CollapsibleTrigger asChild><Button variant="ghost" size="sm"><ChevronDown data-icon="inline-start"/>{title}</Button></CollapsibleTrigger><CollapsibleContent><div className="settings-disclosure-content">{children}</div></CollapsibleContent></Collapsible>;
}
