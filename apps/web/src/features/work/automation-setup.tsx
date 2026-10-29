import {useQuery} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import type {AutoContactOverview} from '@crm/contracts';
import {api} from '@/lib/api';
import {useReviewOverview} from '@/features/comment-review/use-comment-review';
import {Button} from '@/components/ui/button';
export function ReviewAndReplySetup({configId}:{configId?:string}){
 const navigate=useNavigate(),review=useReviewOverview(true);
 const contact=useQuery({queryKey:['auto-contact'],queryFn:()=>api<AutoContactOverview>('/auto-contact'),refetchInterval:5000});
 const policy=review.data?.policies[0],rule=contact.data?.rules[0];
 const open=(tab:string)=>navigate('/work?module=runs&panel=automation-settings&settingsTab='+tab+(configId?'&config='+encodeURIComponent(configId):''));
 return <div className="automation-setup"><section><h3>02 · LLM 评论匹配</h3><p>{review.isError?'读取失败':review.isPending?'正在读取':!policy?'未配置':policy.autoEnabled?'自动匹配已开启':'自动匹配已关闭'}</p><Button variant="ghost" size="sm" onClick={()=>open('review')}>设置需求与匹配开关</Button></section><section><h3>03 · 自动回复</h3><p>{contact.isError?'读取失败':contact.isPending?'正在读取':!rule?'未配置':rule.enabled?'发送已开启':'发送已关闭'}{rule&&!rule.content&&' · 回复内容未配置'}</p><Button variant="ghost" size="sm" onClick={()=>open('contact')}>设置回复内容与账号</Button></section></div>;
}
