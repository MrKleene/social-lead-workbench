import {useId,type ComponentProps,type ReactNode} from 'react';

type SectionProps=Omit<ComponentProps<'section'>,'title'> & {title:ReactNode};
/** Content inside an existing workspace or drawer stays directly visible. */
export function InfoSection({title,children,className,...props}:SectionProps){
 const heading=useId();
 return <section className={['information-section',className].filter(Boolean).join(' ')} aria-labelledby={heading} {...props}><h3 id={heading} className="information-heading">{title}</h3>{children}</section>;
}
