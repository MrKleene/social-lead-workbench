import { AlertCircle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <Alert variant="destructive" role="alert">
      <AlertCircle />
      <AlertDescription>
        {error instanceof Error ? error.message : "操作失败"}
      </AlertDescription>
    </Alert>
  ) : null;
}
export function DemoNotice() {
  return (
    <Alert className="demo-notice">
      <Info />
      <AlertDescription>
        演示数据 · 全部为虚构，不代表真实平台连接。
      </AlertDescription>
    </Alert>
  );
}
export function Loading() {
  return (
    <div className="loading-stack" aria-label="加载中">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </div>
  );
}
