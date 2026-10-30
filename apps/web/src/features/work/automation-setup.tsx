import {useAutomationPreferences} from './settings-data';
import {useQuery} from '@tanstack/react-query';
import type {AutoContactOverview} from '@crm/contracts';
import {api} from '@/lib/api';
import {useReviewOverview} from '@/features/comment-review/use-comment-review';
export function ReviewAndReplySetup(){
 const preferences=useAutomationPreferences();
 const review=useReviewOverview(true);
 const contact=useQuery({queryKey:['auto-contact'],queryFn:()=>api<AutoContactOverview>('/auto-contact'),refetchInterval:5000});
 const policy=(review.data?.policies.find(p=>p.id===preferences.data?.policyId)||review.data?.policies[0]),rule=(contact.data?.rules.find(r=>r.enabled)||contact.data?.rules[0]);
 return <div className="automation-setup"><section><h3>02 · LLM 评论匹配</h3><p>{review.isError?'读取失败':review.isPending?'正在读取':!policy?'未配置':policy.autoEnabled?'自动匹配已开启':'自动匹配已关闭'}</p></section><section><h3>03 · 自动回复</h3><p>{contact.isError?'读取失败':contact.isPending?'正在读取':!rule?'未配置':rule.enabled?'发送已开启':'发送已关闭'}{rule&&!rule.content&&' · 回复内容未配置'}</p></section></div>;
}
