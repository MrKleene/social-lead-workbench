import {useId,type ComponentProps,type ReactNode} from 'react';
import {Card,CardHeader,CardTitle,CardContent} from './ui/card';
import {cn} from '@/lib/utils';
type SectionProps=Omit<ComponentProps<'section'>,'title'> & {title:ReactNode};
export function InfoSection({title,children,className,ref,...props}:SectionProps){
 const heading=useId();
 return <Card ref={node=>{if(typeof ref==='function')ref(node);else if(ref)ref.current=node;}} className={cn('information-section',className)} role="region" aria-labelledby={heading} {...props}><CardHeader><CardTitle><h3 id={heading} className="information-heading">{title}</h3></CardTitle></CardHeader><CardContent>{children}</CardContent></Card>;
}
