import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, Unplug } from "lucide-react";
import { api } from "@/lib/api";
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
    <>
      <div className="page-heading">
        <div>
          <h1>平台能力</h1>

        </div>
        <span className="page-code">CRM / 03</span>
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
      ) : (
        <>
          <div className="platform-grid">
            {query.data?.capabilities.map((cap) => (
              <section className="capability-card" key={cap.platform}>
                <div className="capability-head">
                  <span className="capability-icon">
                    <Unplug />
                  </span>
                  <div>
                    <h2>{cap.name}</h2>
                    <p>{cap.platform === "XHS" ? "只读功能已实现" : cap.status}</p>
                  </div>
                  <Badge variant="outline">{cap.platform === "XHS" ? "使用前需核验账号" : cap.platform === "DOUYIN" ? "读取适配器未实现" : "能力以验证结果为准"}</Badge>
                </div>
                <h3>读取能力</h3>
                <p>{cap.platform === "XHS" ? "支持手动有限搜索、帖子与评论读取、分块保存及符合条件的进度恢复。每次需确认账号与本机会话；不保证全量覆盖、规模或延迟。" : cap.read}</p>
                <div className="disabled-features"><Link to="/auto-contact">查看自动回复的实时能力与资格 →</Link><p>收信与聊天能力需单独核验。</p></div>
                <p className="capability-reason">{cap.platform === "XHS" ? "功能已实现不等于当前账号已核验、设备在线或读取成功。请到账号中心查看实际状态。" : cap.reason}</p>
              </section>
            ))}
          </div>
          <section className="task-panel">
            <div className="section-title">
              <h2>账号记录</h2>
              <Badge variant="secondary">记录状态与会话核验分开</Badge>
            </div>
            <p className="helper-text">本页记录状态不代表本机会话有效。<Link to="/work?module=accounts">前往账号中心核验</Link></p>
            {query.data?.accounts.map((account) => (
              <div className="account-row" key={account.id}>
                <div>
                  <strong>{account.label}</strong>
                  <p>
                    {account.isDemo === true ? "模拟账号；不代表真实平台连接。" : account.isDemo === false ? "非模拟账号记录；会话是否有效需另行核验。" : "账号来源未标明；请到账号中心核对。"}
                    {account.pauseReason && ` 已有状态备注：${account.pauseReason}`}
                  </p>
                </div>
                <Badge variant="outline">
                  {
                    {
                      UNCONNECTED: "未连接",
                      RESTRICTED: "受限",
                      PAUSED: "已暂停",
                    }[account.status] || "状态待核对"
                  }
                </Badge>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
