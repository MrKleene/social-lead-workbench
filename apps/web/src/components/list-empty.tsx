import type {ReactNode} from 'react';
import {Inbox} from 'lucide-react';
import {Empty,EmptyHeader,EmptyMedia,EmptyTitle,EmptyDescription,EmptyContent} from './ui/empty';
export function ListEmpty({title,description,children}:{title:string;description:string;children?:ReactNode}){
 return <Empty className="border" role="status"><EmptyHeader><EmptyMedia variant="icon"><Inbox aria-hidden="true"/></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{children&&<EmptyContent>{children}</EmptyContent>}</Empty>;
}
