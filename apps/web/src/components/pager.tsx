import {Children,type ComponentProps} from 'react';
import {Pagination,PaginationContent,PaginationItem} from './ui/pagination';
export function Pager({children,...props}:ComponentProps<typeof Pagination>){return <Pagination aria-label="分页" {...props}><PaginationContent>{Children.toArray(children).map((child,index)=><PaginationItem key={index}>{child}</PaginationItem>)}</PaginationContent></Pagination>;}
