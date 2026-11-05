import {Button} from './ui/button';
import {Pager} from './pager';
import './result-pagination.css';
export function ResultPagination({total,offset,pageSize=20,pending=false,onChange,label='结果分页'}:{total?:number;offset:number;pageSize?:number;pending?:boolean;onChange:(offset:number)=>void;label?:string}){
 const pages=Math.ceil((total||0)/pageSize),page=pages?Math.min(pages,Math.floor(offset/pageSize)+1):0;
 return <footer className="result-pagination"><span aria-live="polite">{total===undefined?'数量暂不可用':`共 ${total} 条 · 每页 ${pageSize} 条 · 第 ${page}/${pages} 页`}</span><Pager aria-label={label}><Button variant="outline" size="sm" disabled={pending||total===undefined||offset<=0} onClick={()=>onChange(Math.max(0,offset-pageSize))}>上一页</Button><Button variant="outline" size="sm" disabled={pending||total===undefined||offset+pageSize>=total} onClick={()=>onChange(offset+pageSize)}>下一页</Button></Pager></footer>;
}
