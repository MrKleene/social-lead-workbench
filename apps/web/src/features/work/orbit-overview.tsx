import type {ReactNode} from 'react';
import {Search,ScanLine,Send,UsersRound} from 'lucide-react';
import './home-intro.css';

const stages=[
 {title:'采集帖子与评论',description:'按关键词发现帖子，保存正文、评论与回复，随时回看来源。',icon:Search},
 {title:'识别潜在需求',description:'按需开启 AI 语义匹配，逐帖查看评论评分、判断理由与处理进度。',icon:ScanLine},
 {title:'按规则自动回复',description:'在账号可用、授权与额度允许时，按已开启的规则回复；需人工处理的记录单独保留。',icon:Send},
];

export function OrbitOverview({actions}:{admin:boolean;actions?:ReactNode}) {
 return <section className="home-intro" aria-labelledby="home-title">
  <header className="home-intro-heading">

   <span className="home-product-label">SOCIAL LEAD · 项目介绍</span>
   <h1 id="home-title">AI 辅助获客工作台</h1>
   <p>把发现帖子、采集评论、匹配需求与规则回复连成一条工作流，让线索来源和后续跟进都有据可查。</p>

   {actions&&<div className="home-intro-actions">{actions}</div>}
  </header>
  <section aria-labelledby="home-flow-title" className="home-intro-flow">
   <h2 id="home-flow-title" className="sr-only">从发现到触达</h2>
   <div className="simple-home-stages">{stages.map(({title,description,icon:Icon},i)=><article key={title}>
    <div className="home-intro-step"><span className="simple-stage-number">0{i+1}</span><Icon size={20} aria-hidden="true"/></div>
    <h3>{title}</h3><p>{description}</p>
   </article>)}</div>
  </section>
  <footer className="home-intro-follow"><UsersRound size={20} aria-hidden="true"/><div><h2>销售跟进</h2><p>把匹配线索交给销售跟进，记录联系结果与下一步安排；历史任务、原文和回复结果可追溯。</p></div></footer>
 </section>;
}
