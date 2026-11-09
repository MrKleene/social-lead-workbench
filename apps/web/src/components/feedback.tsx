import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {Spinner} from './ui/spinner';
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
export function Loading() {
  return (
    <div className="loading-stack" role="status" aria-live="polite" aria-label="加载中">
      <span className="loading-caption"><Spinner aria-hidden="true"/>加载中</span>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </div>
  );
}
