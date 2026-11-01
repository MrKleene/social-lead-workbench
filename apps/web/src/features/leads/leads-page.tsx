import { SelectField, SelectOption } from '@/components/select-field';
import { Empty } from '@/components/ui/empty';
import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Search,
  ArrowUpRight,
  Info,
  SlidersHorizontal,
  ListChecks,
} from "lucide-react";
import { useLeads } from "./use-leads";
import { LeadDetail } from "./lead-detail";
import { LeadOverview } from "./lead-overview";
import { SegmentedControl } from "@/components/segmented-control";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { DemoNotice, ErrorNotice, Loading } from "@/components/feedback";
import { formatDate, platformLabel, statusLabel } from "@/lib/types";
export function LeadsPage() {
  const state = useLeads();
  const navigate = useNavigate();
  const { id } = useParams();
  const closeDetail = useCallback(() => navigate("/leads"), [navigate]);
  const filtered = state.search !== "" || state.platform !== "all" || state.status !== "all";
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">客户协作 · LEADS</span>
          <h1>线索管理</h1>
          <p>从明确需求开始，让每一次跟进有据可查。</p>
        </div>
        <Button variant="outline" asChild><Link to="/tasks"><ListChecks size={16} />查看任务</Link></Button>
      </div>
      <DemoNotice />
      <LeadOverview total={state.total} pending={state.pending} following={state.following} loading={state.query.isPending} error={state.query.isError} />
      <section className="table-panel" aria-label="线索列表">
        <div className="list-heading"><div><h2>全部线索 <span>{state.query.isError?"读取失败":state.query.isPending?"—":state.rows.length}</span></h2><p>需求、负责人和下一步，在这里有序流转。</p></div><Badge variant="secondary" className="list-scope"><SlidersHorizontal size={14} />灵活筛选</Badge></div>
        <div className="list-controls">
        <div className="list-tabs">
          <SegmentedControl label="线索状态" value={state.status} onChange={state.setStatus} options={[
            { value: "all", label: "全部" }, { value: "PENDING_REVIEW", label: "待确认" },
            { value: "FOLLOWING", label: "跟进中" }, { value: "CLOSED", label: "已关闭" },
          ]} />
        </div>
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={18} />
            <Input
              aria-label="搜索昵称或需求"
              placeholder="搜索昵称或需求"
              value={state.search}
              onChange={(e) => state.setSearch(e.target.value)}
            />
          </div>
          <div className="filters">
            <SelectField
              aria-label="来源平台"
              value={state.platform}
              onValueChange={(e) => state.setPlatform(e)}
            >
              <SelectOption value="all">全部平台</SelectOption>
              <SelectOption value="XHS">小红书</SelectOption>
              <SelectOption value="DOUYIN">抖音</SelectOption>
            </SelectField>
            {filtered && <Button variant="ghost" size="sm" onClick={() => { state.setSearch(""); state.setPlatform("all"); state.setStatus("all"); }}>重置筛选</Button>}

          </div>
        </div>
        </div>
        <ErrorNotice error={state.query.error} />
        {state.query.isPending ? (
          <Loading />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>线索</TableHead>
                <TableHead>来源平台</TableHead>
                <TableHead>需求依据</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>下次跟进</TableHead>
                <TableHead>
                  <span className="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.rows.map((lead, i) => (
                <TableRow
                  key={lead.id}
                  className="lead-row"
                >
                  <TableCell>
                    <div className="lead-identity">
                      <span className={`avatar tone-${i % 3}`}>
                        {lead.identity.nickname.slice(0, 1)}
                      </span>
                      <div>
                        <Button variant="ghost" size="content"
                          className="text-link lead-name"
                          onClick={() => navigate(`/leads/${lead.id}`)}
                        >
                          {lead.identity.nickname}
                        </Button>
                        <p>{lead.summary}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`platform-${lead.identity.platform}`}
                    >
                      {platformLabel[lead.identity.platform]}
                    </Badge>
                  </TableCell>
                  <TableCell className="evidence-cell" title={lead.evidence}>
                    {lead.evidence}
                  </TableCell>
                  <TableCell>
                    <span className={lead.owner ? "" : "muted"}>
                      {lead.owner?.name || "未分配"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`status-${lead.status}`}
                    >
                      <span className="status-dot" />
                      {statusLabel[lead.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="date-cell">
                    {formatDate(lead.nextFollowUpAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`查看${lead.identity.nickname}`}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      <ArrowUpRight />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!state.query.isPending &&
          !state.query.isError &&
          state.rows.length === 0 && (
            <Empty className="empty-state">
              <Search />
              <h3>暂无匹配线索</h3>
              <p>调整筛选条件，或等待管理员分配线索。</p>
            </Empty>
          )}
        <div className="table-footer">
          <span role="status" aria-live="polite">{state.query.isError?"数量读取失败":state.query.isPending?"正在读取":`共 ${state.rows.length} 条`} · 仅显示你有权访问的线索</span>
          <span>最多显示 500 条</span>
        </div>
      </section>
      <p className="evidence-note">
        <Info size={16} />
        专业相关不等于联系同意，请保留原文并人工确认。
      </p>
      {id && <LeadDetail key={id} id={id} onClose={closeDetail} />}
    </>
  );
}
