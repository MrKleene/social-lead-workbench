import {useId,useRef,useState} from 'react';
import {SlidersHorizontal,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Input} from '@/components/ui/input';
import {Field,FieldGroup,FieldLabel,FieldError} from '@/components/ui/field';
import {SelectField,SelectOption} from '@/components/select-field';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {SavedPostList,useSavedPosts,type SavedReviewPost} from './post-picker';
import {reviewSortOptions} from './review-filters';
import type {useReviewResults} from './use-review-results';
export const reviewStateOptions=[['EVALUATED','已评分'],['','全部记录'],['UNANALYSED','未评分'],['FAILED','失败或中断'],['PROCESSING','处理中']] as const;
const manualLabels:Record<string,string>={PENDING:'未人工复核',APPROVED:'已人工确认',REJECTED:'已人工排除'};
type Props={state:ReturnType<typeof useReviewResults>;post:SavedReviewPost|null;onPostChange:(post:SavedReviewPost|null)=>void};
export function ReviewFilterToolbar({state:s,post,onPostChange}:Props){
 const [open,setOpen]=useState(false),[pickPost,setPickPost]=useState(false),trigger=useRef<HTMLButtonElement>(null),id=useId(),posts=useSavedPosts(open&&pickPost),f=s.filters;
 const advanced=Number(f.minScore!==''||f.maxScore!=='')+Number(!!f.status)+Number(!!post)+Number(!!f.from||!!f.to)+Number(!!f.publication);
 const filtered=advanced>0||!!f.search||f.state!==s.defaults.state;
 const chips:Array<{key:string;label:string;clear:()=>void}>=[];
 if(f.search)chips.push({key:'search',label:'搜索：'+f.search,clear:()=>s.change('search','')});
 if(f.state!==s.defaults.state)chips.push({key:'state',label:reviewStateOptions.find(x=>x[0]===f.state)?.[1]||f.state,clear:()=>s.change('state',s.defaults.state)});
 if(f.minScore!==''||f.maxScore!=='')chips.push({key:'score',label:`相关度：${f.minScore||'0'}–${f.maxScore||'100'}`,clear:()=>s.changeMany({minScore:'',maxScore:''})});
 if(f.from||f.to)chips.push({key:'date',label:`评论时间：${f.from||'不限'} 至 ${f.to||'不限'}`,clear:()=>s.changeMany({from:'',to:''})});
 if(f.publication)chips.push({key:'publication',label:f.publication==='unknown'?'时间未知':'时间已知',clear:()=>s.change('publication','')});
 if(f.status)chips.push({key:'status',label:manualLabels[f.status]||f.status,clear:()=>s.change('status','')});
 if(post)chips.push({key:'post',label:'帖子：'+post.title,clear:()=>onPostChange(null)});
 return <>
  <div className="review-filter-toolbar" role="group" aria-label="审核结果筛选">
   <Field className="review-toolbar-search"><FieldLabel className="sr-only" htmlFor={id+'search'}>搜索评论</FieldLabel><Input id={id+'search'} type="search" placeholder="搜索评论原文" maxLength={100} value={f.search} onChange={e=>s.change('search',e.target.value)}/></Field>
   <Field className="review-toolbar-state"><FieldLabel className="sr-only" htmlFor={id+'state'}>评估状态</FieldLabel><SelectField id={id+'state'} aria-label="评估状态" value={f.state} onValueChange={v=>s.change('state',v)}>{reviewStateOptions.map(([v,label])=><SelectOption key={v} value={v}>{label}</SelectOption>)}</SelectField></Field>
   <Button ref={trigger} variant="outline" size="sm" aria-haspopup="dialog" onClick={()=>{setPickPost(false);setOpen(true);}}><SlidersHorizontal data-icon="inline-start"/>筛选{advanced>0&&<Badge variant="secondary">{advanced}</Badge>}</Button>
   {filtered&&<Button size="sm" variant="ghost" onClick={s.reset}><X data-icon="inline-start"/>清除筛选</Button>}
   <Field className="review-toolbar-sort"><FieldLabel className="sr-only" htmlFor={id+'sort'}>结果排序</FieldLabel><SelectField id={id+'sort'} aria-label="结果排序" value={f.sort} onValueChange={v=>s.change('sort',v)}>{reviewSortOptions.map(([v,label])=><SelectOption key={v} value={v}>{label}</SelectOption>)}</SelectField></Field>
  </div>
  {chips.length>0&&<div className="review-active-filters" role="group" aria-label="已选筛选条件">{chips.map(c=><Button key={c.key} variant="outline" size="sm" aria-label={'移除'+c.label} title={c.label} onClick={c.clear}><span className="truncate">{c.label}</span><X data-icon="inline-end"/></Button>)}</div>}
  <Sheet open={open} onOpenChange={setOpen}><SheetContent className="task-settings-sheet review-filter-dialog" onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}}><SheetHeader><SheetTitle>{pickPost?'选择来源帖子':'筛选评论'}</SheetTitle><SheetDescription className="sr-only">筛选已保存的评论审核结果，不执行审核。</SheetDescription></SheetHeader><div className="task-settings-body">
   {pickPost?<><Button variant="ghost" size="sm" onClick={()=>setPickPost(false)}>返回筛选</Button><SavedPostList state={posts} onSelect={p=>{onPostChange(p);setPickPost(false);}}/></>:<>
    <FieldGroup className="review-filter-fields">
     <Field data-invalid={!!s.error&&!!(f.from||f.to)}><FieldLabel htmlFor={id+'from'}>评论发布开始日期</FieldLabel><Input id={id+'from'} type="date" aria-label="评论发布开始日期（北京时间）" value={f.from} aria-invalid={!!s.error&&!!(f.from||f.to)} onChange={e=>s.change('from',e.target.value)}/></Field>
     <Field data-invalid={!!s.error&&!!(f.from||f.to)}><FieldLabel htmlFor={id+'to'}>结束日期（含当日）</FieldLabel><Input id={id+'to'} type="date" aria-label="评论发布结束日期（北京时间，含当日）" value={f.to} aria-invalid={!!s.error&&!!(f.from||f.to)} onChange={e=>s.change('to',e.target.value)}/></Field>
     <Field><FieldLabel htmlFor={id+'min'}>最低相关度</FieldLabel><Input id={id+'min'} type="number" min={0} max={100} placeholder="不限" value={f.minScore} onChange={e=>s.change('minScore',e.target.value)}/></Field>
     <Field><FieldLabel htmlFor={id+'max'}>最高相关度</FieldLabel><Input id={id+'max'} type="number" min={0} max={100} placeholder="不限" value={f.maxScore} onChange={e=>s.change('maxScore',e.target.value)}/></Field>
     <Field><FieldLabel htmlFor={id+'publication'}>评论时间</FieldLabel><SelectField id={id+'publication'} aria-label="评论时间完整性" value={f.publication} onValueChange={v=>s.change('publication',v)}><SelectOption value="">全部时间</SelectOption><SelectOption value="known">仅时间已知</SelectOption><SelectOption value="unknown">仅时间未知</SelectOption></SelectField></Field>
     <Field><FieldLabel htmlFor={id+'manual'}>人工复核</FieldLabel><SelectField id={id+'manual'} aria-label="人工复核" value={f.status} onValueChange={v=>s.change('status',v)}><SelectOption value="">全部复核状态</SelectOption>{Object.entries(manualLabels).map(([v,label])=><SelectOption key={v} value={v}>{label}</SelectOption>)}</SelectField></Field>
     <Field className="review-filter-source"><FieldLabel>来源帖子</FieldLabel><div className="review-filter-source-control"><span>{post?.title||'全部已保存帖子'}</span><Button variant="outline" size="sm" onClick={()=>setPickPost(true)}>选择帖子</Button>{post&&<Button variant="ghost" size="sm" onClick={()=>onPostChange(null)}>清除</Button>}</div></Field>
    </FieldGroup>
    <span className="review-filter-timezone">日期按北京时间筛选</span>
    {s.invalid&&<FieldError>{s.error}</FieldError>}
    <div className="review-filter-dialog-actions"><Button variant="ghost" size="sm" onClick={s.reset}>清除筛选</Button><Button disabled={s.invalid} onClick={()=>setOpen(false)}>完成</Button></div>
   </>}
  </div></SheetContent></Sheet>
 </>;
}
