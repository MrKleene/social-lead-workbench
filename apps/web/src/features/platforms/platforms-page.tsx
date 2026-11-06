import {Button} from '@/components/ui/button';
import './platforms-page.css';
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ErrorNotice, Loading } from "@/components/feedback";

type Data = {
  capabilities: {
    platform: string;
    name: string;
    status: string;
    read: string;
    reason: string;
  }[];
  accounts: {
    id: string;
    label: string;
    status: string;
    pauseReason: string | null;
    isDemo?: boolean;
  }[];
};
export function PlatformsPage() {
  const query = useQuery({
    queryKey: ["platforms"],
    queryFn: () => api<Data>("/platforms"),
  });
  return (
    <section className="platforms-page">
      <div className="page-heading">
        <div>
          <h1>平台能力</h1>

        </div>

      </div>
      <Alert className="demo-notice">
        <ShieldAlert />
        <AlertTitle>按能力与账号资格分别核验</AlertTitle>
        <AlertDescription>
          采集、自动回复与收信具有不同的能力和授权条件。请以自动化任务中的当前资格与执行结果为准；平台受限时不换号规避。
        </AlertDescription>
      </Alert>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? <Button variant="outline" onClick={()=>void query.refetch()}>重试读取平台能力</Button> : (
        <>
          <section className="table-panel graphite-platform-panel"><h2>接入与读取能力</h2><Table className="graphite-platform-table" aria-label="平台接入与读取能力"><TableHeader><TableRow><TableHead>平台</TableHead><TableHead>接入状态</TableHead><TableHead>已实现读取范围</TableHead><TableHead>当前限制</TableHead><TableHead>入口</TableHead></TableRow></TableHeader><TableBody>{query.data?.capabilities.map(cap=><TableRow key={cap.platform}><TableCell><strong>{cap.name}</strong></TableCell><TableCell data-label="接入状态"><Badge variant="secondary">{cap.platform==='XHS'?'只读功能已实现':cap.platform==='DOUYIN'?'读取适配器未实现':cap.status}</Badge></TableCell><TableCell data-label="读取范围">{cap.platform==='XHS'?'有限搜索、帖子与评论读取、分块保存及符合条件的进度恢复。':cap.read}</TableCell><TableCell data-label="当前限制">{cap.platform==='XHS'?'执行前核验账号、设备与授权；读取覆盖以实际结果为准。':cap.reason}</TableCell><TableCell><Link to="/auto-contact">查看回复能力与资格 →</Link></TableCell></TableRow>)}</TableBody></Table></section>

        </>
      )}
    </section>
  );
}
