import { type ComponentProps, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
export function Disclosure({title, children, ...props}: Omit<ComponentProps<typeof Collapsible>, 'title'> & {title:ReactNode}) {
  return <Collapsible {...props}><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="content" className="disclosure-trigger"><ChevronDown data-icon="inline-start"/>{title}</Button></CollapsibleTrigger><CollapsibleContent>{children}</CollapsibleContent></Collapsible>;
}
