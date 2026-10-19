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
          <p>连接状态透明可见，每项能力都以验证结果为准。</p>
        </div>
        <span className="page-code">CRM / 03</span>
      </div>
      <Alert className="demo-notice">
        <ShieldAlert />
        <AlertTitle>第一里程碑 · 仅打通 CRM 基础</AlertTitle>
        <AlertDescription>
          尚未完成从评论识别需求到主动首次联系的整体获客流程。受限账号不再测试发送，绝不自动换号规避限制。
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
                    <p>{cap.status}</p>
                  </div>
                  <Badge variant="outline">未连接真实账号</Badge>
                </div>
                <h3>读取能力</h3>
                <p>{cap.read}</p>
                <div className="disabled-features">
                  {["自动评论", "私信", "内嵌聊天"].map((feature) => (
                    <div key={feature}>
                      <span>{feature}</span>
                      <Button size="sm" variant="outline" disabled>
                        <LockKeyhole data-icon="inline-start" />
                        未验证
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="capability-reason">{cap.reason}</p>
              </section>
            ))}
          </div>
          <section className="task-panel">
            <div className="section-title">
              <h2>虚构账号占位</h2>
              <Badge variant="secondary">无平台凭据</Badge>
            </div>
            {query.data?.accounts.map((account) => (
              <div className="account-row" key={account.id}>
                <div>
                  <strong>{account.label}</strong>
                  <p>
                    {account.pauseReason || "仅用于演示状态，无真实平台连接。"}
                  </p>
                </div>
                <Badge variant="outline">
                  {
                    {
                      UNCONNECTED: "未连接",
                      RESTRICTED: "受限",
                      PAUSED: "已暂停",
                    }[account.status]
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
