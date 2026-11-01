import {Link} from 'react-router-dom';
import {ArrowRight,Search,ScanLine,Send,UsersRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import './home-intro.css';

const stages=[
 {title:'采集帖子与评论',description:'按关键词发现帖子，保存评论、回复与原文来源。',icon:Search},
 {title:'识别潜在需求',description:'按需开启 AI 语义匹配，查看评论相关度与判断依据。',icon:ScanLine},
 {title:'按规则自动回复',description:'在账号可用、授权与额度允许时，按已开启的规则回复。',icon:Send},
];

export function OrbitOverview(_props:{admin:boolean}) {
 return <section className="home-intro" aria-labelledby="home-title">
  <header className="home-intro-heading">

   <h1 id="home-title">AI 辅助获客工作台</h1>
   <p>从帖子和评论中发现需求，连接评论匹配、规则回复与销售跟进。</p>

  </header>
  <section aria-labelledby="home-flow-title" className="home-intro-flow">
   <h2 id="home-flow-title" className="sr-only">从发现到触达</h2>
   <div className="simple-home-stages">{stages.map(({title,description,icon:Icon},i)=><article key={title}>
    <div className="home-intro-step"><span className="simple-stage-number">0{i+1}</span><Icon size={20} aria-hidden="true"/></div>
    <h3>{title}</h3><p>{description}</p>
   </article>)}</div>
  </section>
  <footer className="home-intro-follow"><UsersRound size={20} aria-hidden="true"/><div><h2>销售跟进</h2><p>结合线索来源与需求，记录联系结果和下一步跟进。</p></div></footer><div className="home-intro-actions"><Button asChild><Link to="/work">进入工作台 <ArrowRight data-icon="inline-end"/></Link></Button></div>
 </section>;
}
