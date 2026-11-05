import type {RunCommentReview,RunReviewComment,RunReviewJob} from '@crm/contracts';
export function reviewStateLabel(state:string){return ({EVALUATED:'已评分',UNANALYSED:'待分析',UNCONFIGURED:'尚未配置',PROCESSING:'审核中',FAILED:'审核失败',PENDING:'等待审核',COMPLETED:'处理结束',CANCELLED:'已取消',SKIPPED:'未送审'} as Record<string,string>)[state]||'状态待核查';}
export function commentReviewLabel(comment:RunReviewComment,jobs:RunReviewJob[]){
 if(comment.reviews[0])return reviewStateLabel(comment.reviews[0].state);
 if(jobs.some(j=>j.status==='PROCESSING'))return '帖子审核中';
 if(jobs.some(j=>j.status==='PENDING'))return '等待审核';
 return '尚无审核记录';
}
export function scoreLabel(review?:RunCommentReview){return review?.state==='EVALUATED'&&review.score!==null?String(review.score):'—';}
export function decisionLabel(decision:string|null|undefined){return ({MATCH:'相关',NO_MATCH:'不相关',UNCERTAIN:'待判断'} as Record<string,string>)[decision||'']||'';}

/** Job status belongs to this run; first-capture review totals are not run execution totals. */
export function runReviewStage(jobs:Record<string,number>,hasComments:boolean,enabled:boolean){
 if(jobs.PROCESSING||jobs.RUNNING)return {label:`评论匹配中 · ${reviewBatchProgress(jobs)}`,notice:undefined};
 if(jobs.PENDING)return {label:`等待评论匹配 · ${reviewBatchProgress(jobs)}`,notice:undefined};
 if(jobs.FAILED)return {label:'匹配存在失败',notice:'评论匹配失败，请查看对应帖子。'};
 if(jobs.CANCELLED||jobs.SKIPPED)return {label:'存在未送审帖子',notice:'部分帖子未送审，请查看具体原因。'};
 if(Object.keys(jobs).some(k=>jobs[k]>0&&!['COMPLETED','FAILED','PENDING','PROCESSING','RUNNING','CANCELLED','SKIPPED'].includes(k)))return {label:'匹配状态待核查',notice:'匹配状态待核查。'};
 if(jobs.COMPLETED)return {label:'匹配作业已结束',notice:undefined};
 return {label:hasComments?(enabled?'等待匹配记录':'匹配未启用'):'暂无评论',notice:undefined};
}

export function reviewBatchProgress(jobs:Record<string,number>){
 const total=Object.values(jobs).reduce((n,v)=>n+v,0),done=jobs.COMPLETED||0;
 return total?`已完成 ${done}/${total} 批${jobs.PENDING?` · ${jobs.PENDING} 批等待`:''}`:'';
}
