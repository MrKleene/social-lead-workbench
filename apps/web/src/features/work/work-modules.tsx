import { Link } from 'react-router-dom';
import { Settings2, ScanLine, MessagesSquare, Users, ListChecks, ArrowUpRight } from 'lucide-react';
export function WorkModules({ admin, configs, active, matches, templates, follow, runsOpen, onRuns, onQueue }: {
  admin: boolean; configs: number; active: number; matches: number; templates: number | undefined; follow: number;
  runsOpen: boolean; onRuns: () => void; onQueue: (view: string) => void;
}) {
  return <nav className="work-modules" aria-label="工作模块">
    {admin && <Link className="work-module" to="/collection"><Settings2/><span>搜索设置</span><strong>{configs}</strong><small>关键词与预算</small><ArrowUpRight className="module-arrow"/></Link>}
    {admin && <button className="work-module" aria-expanded={runsOpen} aria-controls="run-module" onClick={onRuns}><ScanLine/><span>采集任务</span><strong>{active}</strong><small>{active ? '执行中' : '当前无运行'}</small><ArrowUpRight className="module-arrow"/></button>}
    <button className="work-module" onClick={() => onQueue('new')}><Users/><span>匹配线索</span><strong>{matches}</strong><small>待查看原文</small><ArrowUpRight className="module-arrow"/></button>
    {admin && <Link className="work-module" to="/templates"><MessagesSquare/><span>回复话术</span><strong>{templates ?? '—'}</strong><small>仅保存与预览</small><ArrowUpRight className="module-arrow"/></Link>}
    <button className="work-module" onClick={() => onQueue('follow')}><ListChecks/><span>销售跟进</span><strong>{follow}</strong><small>联系后的协作</small><ArrowUpRight className="module-arrow"/></button>
  </nav>;
}
