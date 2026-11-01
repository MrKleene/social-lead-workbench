import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import { Empty } from '@/components/ui/empty';
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Pause, RotateCcw, ListChecks } from "lucide-react";
import { SegmentedControl } from "@/components/segmented-control";
import { useTasks } from "./use-tasks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DemoNotice, ErrorNotice, Loading } from "@/components/feedback";
import { formatDate } from "@/lib/types";
export function TasksPage() {
  const { query, update } = useTasks();
  const [filter, setFilter] = useState("PENDING");
  const rows = (query.isError ? [] : query.data || []).filter(task => filter === "all" || task.status === filter);
  const options = [{ value: "PENDING", label: "待处理" }, { value: "DONE", label: "已完成" }, { value: "PAUSED", label: "已暂停" }, { value: "all", label: "全部" }]
    .map(option => ({ ...option, count: query.isError||query.isPending?undefined:(query.data || []).filter(task => option.value === "all" || task.status === option.value).length }));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">团队协作 · TASKS</span><h1>任务中心</h1>

        </div>
        <Badge variant="secondary" className="heading-pill"><ListChecks size={16} />人工跟进工作流</Badge>
      </div>
      <DemoNotice />
      <ErrorNotice error={query.error || update.error} />
      <section className="task-panel">
        <div className="task-filter"><SegmentedControl label="任务状态" value={filter} options={options} onChange={setFilter} /></div>
        {update.isSuccess && <p className="success-note" role="status" key={update.submittedAt}><Check size={16} />任务状态已更新</p>}
        <div className="section-title">
          <h2>人工任务</h2>
          <Badge variant="secondary">{query.isError?"读取失败":query.isPending?"正在读取":`${rows.length} 项`}</Badge>
        </div>

        {query.isPending ? (
          <Loading />
        ) : (
          !query.isError &&
          <Table className="graphite-task-table" aria-label="人工任务"><TableHeader><TableRow><TableHead>任务</TableHead><TableHead>关联线索</TableHead><TableHead>负责人</TableHead><TableHead>到期时间</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{rows.map((task) => (
            <TableRow key={task.id} className={task.status === "DONE" ? "task-done" : ""}>
              <TableCell data-label="任务" className="task-title-cell"><strong>{task.title}</strong></TableCell>
              <TableCell data-label="关联线索"><Link to={`/leads/${task.lead.id}`}>{task.lead.identity.nickname}</Link></TableCell>
              <TableCell data-label="负责人">{task.lead.owner?.name||'未分配'}</TableCell>
              <TableCell data-label="到期">{formatDate(task.dueAt)}</TableCell><TableCell data-label="状态">
              <Badge variant="outline">
                {
                  { PENDING: "待处理", DONE: "已完成", PAUSED: "已暂停" }[
                    task.status
                  ]
                }
              </Badge></TableCell>
              <TableCell><div className="graphite-task-actions">
                {task.status !== "DONE" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({ id: task.id, status: "DONE" })
                    }
                  >
                    <Check data-icon="inline-start" />
                    完成
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    task.status === "PENDING" ? "暂停任务" : "重新打开任务"
                  }
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      id: task.id,
                      status: task.status === "PENDING" ? "PAUSED" : "PENDING",
                    })
                  }
                >
                  {task.status === "PENDING" ? <Pause /> : <RotateCcw />}
                </Button>
              </div></TableCell>
            </TableRow>
          ))}</TableBody></Table>
        )}
        {!query.isPending && !query.isError && rows.length === 0 && (
          <Empty className="empty-state">
            <ListChecks />
            <h3>当前分类暂无任务</h3>
            <p>在自己的线索详情中创建人工跟进任务。</p>
          </Empty>
        )}
      </section>
    </>
  );
}
