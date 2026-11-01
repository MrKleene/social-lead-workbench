import { Link } from "react-router-dom";
import { ArrowUpRight, Clock3, UsersRound, MessagesSquare, CheckCheck } from "lucide-react";
import { useTasks } from "@/features/tasks/use-tasks";
import { formatDate } from "@/lib/types";
import { ErrorNotice } from "@/components/feedback";

export function LeadOverview({ total, pending, following, loading, error }: {
  total: number; pending: number; following: number; loading: boolean; error?: boolean;
}) {
  const { query } = useTasks();
  const tasks = (query.isError ? [] : query.data || []).filter(t => t.status === "PENDING")
    .sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity));
  return (
    <div className="overview-grid">
      <div className="overview-summary">
        <div className="overview-label"><span className="eyebrow">工作概览</span><span>当前可访问范围</span></div>
        <div className="metrics">
          {[
            { label: "线索总数", value: total, icon: UsersRound, hint: "当前可访问的线索" },
            { label: "待人工核验", value: pending, icon: Clock3, hint: "保留依据，确认需求" },
            { label: "跟进中", value: following, icon: MessagesSquare, hint: "持续记录沟通进展" },
          ].map(({ label, value, icon: Icon, hint }, i) => (
            <section className={`metric metric-${i}`} key={label}>
              <div className="metric-top"><p>{label}</p><span className={`metric-icon tone-${i}`}><Icon size={17} /></span></div>
              <strong>{error ? "—" : loading ? "—" : value.toString()}</strong>
              <small>{error?"读取失败，请重试":hint}</small>
            </section>
          ))}
        </div>
      </div>
      <aside className="next-actions" aria-label="待跟进任务摘要">
        <div className="section-title"><span className="task-icon"><Clock3 size={17} /></span><h2>待跟进任务</h2><Link to="/tasks" aria-label="查看全部任务"><ArrowUpRight size={18} /></Link></div>
        <ErrorNotice error={query.error} />
        {query.isPending ? <p className="helper-text">正在读取任务…</p> : tasks.length ? (
          <div className="upcoming-list">{tasks.slice(0, 2).map(task => (
            <Link key={task.id} to={`/leads/${task.lead.id}`} className="upcoming-item">
              <span className="status-dot" /><div><strong>{task.title}</strong><small>{task.lead.identity.nickname} · {formatDate(task.dueAt)}</small></div><ArrowUpRight size={14} />
            </Link>
          ))}</div>
        ) : !query.isError && <div className="next-empty"><CheckCheck size={25} /><div><strong>待办已清空</strong><p>在详情中安排下一次跟进。</p></div></div>}
      </aside>
    </div>
  );
}
