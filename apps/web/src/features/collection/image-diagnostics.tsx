import {safeImageDiagnostics,type ImageReason} from '@crm/contracts';
const labels:Record<ImageReason,string>={NOT_RETURNED:'字段未返回',EMPTY:'空值',UNSUPPORTED_FORMAT:'格式不支持',URL_FORMAT:'网址格式不支持',PROTOCOL:'非允许协议',HOST:'非允许域名',URL_COMPONENTS:'含查询或其他受限信息',PATH:'非允许路径',ACCEPTED:'已接受'};
export function ImageDiagnostics({value}:{value:unknown}){
 const data=safeImageDiagnostics(value);if(!data||!Object.keys(data).length)return <p>此次记录没有图片诊断，无法追溯缺图原因。</p>;
 return <details><summary>图片字段诊断</summary><p>最近一次读取的字段检查；不代表图片现在可加载。</p><dl>{(['searchCover','detailCover','authorAvatar'] as const).map(key=>{const d=data[key];if(!d)return null;return <div key={key}><dt>{{searchCover:'搜索封面',detailCover:'详情首图',authorAvatar:'头像'}[key]}</dt><dd>{d.shape==='NOT_RETURNED'?'来源字段未返回':d.shape==='EMPTY'?'来源为空':d.shape==='UNSUPPORTED'?'来源格式不支持':`收到 ${d.fieldCount} 个候选字段`}{d.outcomes.length?' · '+d.outcomes.map(x=>`${labels[x.reason]} ${x.count}`).join('，'):''}{d.truncated?' · 仅检查前 8 个附加候选':''}</dd></div>;})}</dl></details>;
}
