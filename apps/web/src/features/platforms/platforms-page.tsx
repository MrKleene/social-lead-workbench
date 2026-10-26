import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, LockKeyhole, Unplug } from "lucide-react";
import { api, send } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ErrorNotice, Loading } from "@/components/feedback";
import { useAuth } from "@/features/auth/use-auth";
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
  const { user } = useAuth(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["platforms"],
    queryFn: () => api<Data>("/platforms"),
  });
  const pause = useMutation({
    mutationFn: (id: string) => send(`/platforms/${id}/pause`, "POST", {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ["platforms"] }),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>平台能力</h1>
          <p>只读采集与外发能力分开说明；账号是否可用，以账号中心当次核验为准。</p>
        </div>
        <span className="page-code">CRM / 03</span>
      </div>
      <Alert className="demo-notice">
        <ShieldAlert />
        <AlertTitle>小红书只读采集已实现 · 外发与收信未验收</AlertTitle>
        <AlertDescription>
          已支持手动有限读取、保存原文与人工跟进。真实自动评论、私信发送与收信未验收，保持关闭；不代表完整获客流程已打通。受限账号不测试发送，不自动换号规避限制。
        </AlertDescription>
      </Alert>
      <ErrorNotice error={query.error || pause.error} />
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
                <div className="disabled-features">
                  {["自动评论", "私信发送", "收信与内嵌聊天"].map((feature) => (
                    <div key={feature}>
                      <span>{feature}</span>
                      <Button size="sm" variant="outline" disabled>
                        <LockKeyhole data-icon="inline-start" />
                        未验收 · 关闭
                      </Button>
                    </div>
                  ))}
                </div>
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
                {user?.role === "ADMIN" && (
                  <Button
                    variant="outline"
                    disabled={account.status === "PAUSED" || pause.isPending}
                    onClick={() => pause.mutate(account.id)}
                  >
                    暂停
                  </Button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
