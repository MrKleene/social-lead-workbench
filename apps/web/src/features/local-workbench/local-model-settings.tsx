import {useState,type FormEvent} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {localApi} from './local-api';
export function LocalModelSettings({keyConfigured}:{keyConfigured:boolean}){
 const client=useQueryClient(),info=useQuery({queryKey:['local','workflow'],queryFn:()=>localApi('workflowOverview')}),[model,setModel]=useState(''),[limit,setLimit]=useState('1'),[consent,setConsent]=useState(false),[policyConsent,setPolicyConsent]=useState(false);
 const refresh=()=>client.invalidateQueries({queryKey:['local']});
 const save=useMutation({mutationFn:(input:unknown)=>localApi('saveModelProfile',input),onSuccess:()=>{setConsent(false);void refresh();}}),toggle=useMutation({mutationFn:(input:unknown)=>localApi('setReviewPolicy',input),onSuccess:refresh});
 const data=info.data,selected=data?.choices.find(c=>c.id===(model||data.model?.model||data.choices[0]?.id));
 const submit=(e:FormEvent)=>{e.preventDefault();if(!selected||!consent)return;save.mutate({version:data?.model?.version??0,model:selected.id,dailyLimit:Number(limit),priceAck:selected.id+':'+selected.priceVersion,consent:'beijing-original-comments-v2'});};
 const error=info.error||save.error||toggle.error;
 return <section className="local-panel"><h2>模型审核授权</h2>{error&&<p role="alert" className="local-error">{error.message}</p>}{data&&<>
 <p>使用北京千问接口。配置保存不会调用模型；每批评论需要预览并另行授权。</p>{data.modelPaused&&<p role="alert">存在结果未知的模型请求，须核对后才能继续。修改配置不会解除暂停。</p>}
 <form className="local-editor" onSubmit={submit}><label>审核模型<select value={selected?.id??''} onChange={e=>{setModel(e.target.value);setConsent(false);}}>{data.choices.map(c=><option key={c.id} value={c.id}>{c.id}</option>)}</select></label><label>每日最多请求次数<input type="number" min={1} max={100} value={limit} onChange={e=>setLimit(e.target.value)} required/></label><p>项目价目版本：{selected?.priceVersion}。{selected?.priceDescription}。费用以供应商账单为准。</p><label className="local-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我同意将选定评论原文发送到北京千问，并确认以上价目与请求次数。</label><Button type="submit" pending={save.isPending} disabled={!consent||!keyConfigured||!data.capabilities.review}>保存审核授权</Button>{!keyConfigured&&<p>请先加密保存模型密钥。</p>}{!data.capabilities.review&&<p>当前测试环境不启用付费模型请求。</p>}</form>
 <h3>可选匹配目标</h3><p>在配置管理中添加“匹配目标”，可配置多条。修改后需要重新授权。</p><label className="local-check"><input type="checkbox" checked={policyConsent} onChange={e=>setPolicyConsent(e.target.checked)}/>允许选定目标用于原文审核；每批仍需单独确认。</label><ul className="local-config-list">{data.policies.map(p=><li key={p.id}><div><strong>{p.name}</strong><span>{p.target}</span><small>{p.enabled?'已允许用于审核':'尚未授权'}</small></div><Button variant="outline" pending={toggle.isPending} disabled={!p.enabled&&(!policyConsent||!data.model?.authorized)} onClick={()=>toggle.mutate({id:p.id,version:p.version,enabled:!p.enabled,consent:'comment-review-original-first-use-v2',modelVersion:data.model?.version})}>{p.enabled?'停用':'允许审核'}</Button></li>)}</ul>
 </>}</section>;
}
