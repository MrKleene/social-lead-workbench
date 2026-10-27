import type {ReviewOverview} from '@crm/contracts';
export function savedPostReviewNotice(data:ReviewOverview|undefined,checking:boolean,error:boolean){
 if(error||!checking&&!Array.isArray(data?.policies))return {ready:false,key:'unknown',text:'无法确认自动识别状态，请刷新后再提交。'};
 if(checking||!data)return {ready:false,key:'checking',text:'正在确认自动识别状态…'};
 const enabled=data.policies.filter(p=>p.autoEnabled);
 const key=JSON.stringify([data.modelVersion,data.connection.model,data.policies.map(p=>[p.id,p.version,p.autoEnabled])]);
 return {ready:true,key,text:enabled.length?`自动识别已开启：覆盖检查通过后，已保存评论原文将发送给已配置模型 ${data.connection.model}，可能产生费用；仍受已有授权和预算限制。`:'自动识别关闭：本次仅采集并保存原文，不调用模型。'};
}
