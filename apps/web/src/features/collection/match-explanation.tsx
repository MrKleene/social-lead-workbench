import {InfoDrawer} from '@/components/information-panel';
import { Assessment, assessmentReasons } from '@crm/contracts';
const labels={COMMENT:'当前评论',POST_TITLE:'帖子标题',POST_BODY:'帖子正文',PARENT_COMMENT:'直接上级评论'};
export function MatchExplanation({assessment:a}:{assessment?:Assessment|null}){if(!a)return null;return <InfoDrawer  title={<>查看匹配依据 · {assessmentReasons[a.reason]||a.reason}</>}>{a.professions.length>0&&<p>识别到的词条：{a.professions.join('、')}</p>}{a.evidence.map((e,i)=><p key={i}><strong>{labels[e.source]} · {e.terms.join('、')}</strong><br/>{e.excerpt}</p>)}{!a.contextAvailable&&<p>没有已获取的主题上下文，不能确认用途。</p>}{a.reason==='PARENT_MISSING'&&<p>上级评论没有获取，不能补猜。</p>}</InfoDrawer>;}
