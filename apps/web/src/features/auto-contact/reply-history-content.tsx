import type { ReplyHistoryItem } from "@crm/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Disclosure } from "@/components/disclosure";
import { DetailItem, DetailList } from "@/components/patterns/detail-sheet";

const labels: Record<string, string> = {
  CONFIRMED: "回复成功",
  NOT_ATTEMPTED: "未发送",
  UNKNOWN: "结果未知",
  FAILED: "历史失败",
  RESERVED: "已预占",
  ATTEMPTED: "执行中",
  CANCELLED: "已取消",
  SIMULATED_SUCCESS: "模拟完成",
};

const notes: Record<string, string> = {
  CONFIRMED: "平台已确认",
  NOT_ATTEMPTED: "提交前停止",
  UNKNOWN: "保留占用 · 勿重发",
  FAILED: "提交情况见原因",
  RESERVED: "等待执行",
  ATTEMPTED: "待平台确认",
  CANCELLED: "已取消",
  SIMULATED_SUCCESS: "未真实发送",
};

/** 状态 → Badge 变体。语义色只用于状态（DESIGN.md §7）。 */
const tones: Record<
  string,
  "success" | "warning" | "destructive" | "outline"
> = {
  CONFIRMED: "success",
  UNKNOWN: "warning",
  FAILED: "destructive",
  ATTEMPTED: "outline",
};

const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      })
    : "未记录";

const channel = (item: ReplyHistoryItem) =>
  item.channel === "COMMENT"
    ? "评论回复"
    : item.channel === "DM"
      ? "私信"
      : "渠道未保存";

const recipient = (item: ReplyHistoryItem) =>
  item.recipientName ??
  (item.recipientId ? `用户 ${item.recipientId}` : "收件人未保存");

const planned = (item: ReplyHistoryItem) =>
  !item.attemptedAt &&
  ["NOT_ATTEMPTED", "RESERVED", "CANCELLED"].includes(item.displayStatus);

function SenderIdentity({ item }: { item: ReplyHistoryItem }) {
  const name =
    item.senderName ??
    (item.senderId ? `账号 · ${item.senderId.slice(-6)}` : "发送账号未记录");

  return (
    <>
      {item.senderId ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <strong className="font-medium">{name}</strong>
          </TooltipTrigger>
          <TooltipContent>{item.senderId}</TooltipContent>
        </Tooltip>
      ) : (
        <strong className="font-medium">{name}</strong>
      )}
      {!item.senderName && item.senderId ? (
        <small className="block text-caption text-muted-foreground">
          发送时昵称未记录
        </small>
      ) : null}
    </>
  );
}

function Outcome({ item }: { item: ReplyHistoryItem }) {
  return (
    <Badge variant={tones[item.displayStatus] ?? "outline"}>
      {labels[item.displayStatus] ?? "状态待核查"}
    </Badge>
  );
}

export function ReplyHistoryTable({
  items,
  onOpen,
}: {
  items: ReplyHistoryItem[];
  onOpen: (item: ReplyHistoryItem) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table className="min-w-[1080px] table-fixed">
        <TableCaption className="sr-only">
          回复历史：发送账号、接收人、原帖评论、正文、渠道、执行开始时间与结果
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[190px]">发送人</TableHead>
            <TableHead>接收人</TableHead>
            <TableHead>原帖与评论</TableHead>
            <TableHead className="w-[144px]">回复内容</TableHead>
            <TableHead className="w-[132px]">渠道</TableHead>
            <TableHead className="w-[80px]">执行开始</TableHead>
            <TableHead>结果</TableHead>
            <TableHead>详情</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} aria-label={`回复记录 ${item.id}`}>
              <TableCell className="align-top whitespace-normal">
                <SenderIdentity item={item} />
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                {recipient(item)}
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <strong className="font-medium">
                  {item.origin === "CONVERSATION"
                    ? "私信会话"
                    : (item.postTitle ?? "标题未保存")}
                </strong>
                <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
                  {item.origin === "CONVERSATION"
                    ? (item.inboundMessage ?? "来信未保存")
                    : (item.originalComment ?? "原评论未保存")}
                </p>
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                {planned(item) ? (
                  <span className="text-caption text-muted-foreground">
                    计划：
                  </span>
                ) : null}
                {item.content || "正文未保存"}
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                {channel(item)}
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <time
                  dateTime={item.attemptedAt ?? undefined}
                  className="text-caption tabular-nums"
                >
                  {item.attemptedAt ? time(item.attemptedAt) : "—"}
                </time>
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <Outcome item={item} />
                <small className="mt-1.5 block text-caption text-muted-foreground">
                  {notes[item.displayStatus] ?? "查看记录详情"}
                </small>
              </TableCell>
              <TableCell className="text-right align-top">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`查看回复详情 ${item.id}`}
                  onClick={() => onOpen(item)}
                >
                  查看详情
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ReplyHistoryDetail({ item }: { item: ReplyHistoryItem }) {
  return (
    <div className="flex flex-col gap-5 text-body">
      <div className="flex flex-wrap items-center gap-2">
        <Outcome item={item} />
        <span className="text-caption text-muted-foreground">
          {notes[item.displayStatus] ?? item.displayStatus}
        </span>
        <small className="ms-auto text-caption text-muted-foreground">
          {item.origin === "CONVERSATION"
            ? "会话回复"
            : item.origin === "RULE"
              ? "规则自动任务"
              : "单条受控测试"}{" "}
          · {channel(item)}
        </small>
      </div>

      {item.displayStatus === "UNKNOWN" ? (
        <Alert role="status" variant="warning">
          <AlertDescription>结果未知，待核对。</AlertDescription>
        </Alert>
      ) : null}

      <DetailList>
        <DetailItem label={item.origin === "CONVERSATION" ? "来源" : "来源帖子"}>
          {item.origin === "CONVERSATION" ? "私信会话" : ""}
          {item.origin !== "CONVERSATION" && (item.postTitle ?? "标题未保存")}
          {item.postUrl ? (
            <>
              {" · "}
              <a
                href={item.postUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                查看原帖
              </a>
            </>
          ) : null}
        </DetailItem>
        <DetailItem label="发送账号">
          <SenderIdentity item={item} />
        </DetailItem>
        <DetailItem label="接收人">{recipient(item)}</DetailItem>
        <DetailItem
          label={item.origin === "CONVERSATION" ? "原来信" : "原评论"}
        >
          <span className="whitespace-pre-wrap break-words">
            {item.origin === "CONVERSATION"
              ? (item.inboundMessage ?? "来信未保存")
              : (item.originalComment ?? "原评论未保存")}
          </span>
        </DetailItem>
      </DetailList>

      <section className="flex flex-col gap-2 border-t pt-4">
        <h3 className="text-body font-semibold">
          {planned(item)
            ? "计划回复正文"
            : item.displayStatus === "SIMULATED_SUCCESS"
              ? "模拟回复正文"
              : "记录的回复正文"}
        </h3>
        <p className="rounded-md bg-muted p-3 leading-relaxed whitespace-pre-wrap break-words">
          {item.content || "正文未保存"}
        </p>
      </section>

      <section className="flex flex-col gap-2 border-t pt-4">
        <h3 className="text-body font-semibold">结果与时间</h3>
        {item.reason || item.displayStatus === "UNKNOWN" ? (
          <p className="leading-relaxed text-muted-foreground break-words">
            {item.reason || ""}
          </p>
        ) : null}
        <DetailList>
          <DetailItem label="记录建立">{time(item.createdAt)}</DetailItem>
          <DetailItem label="执行开始">{time(item.attemptedAt)}</DetailItem>
          <DetailItem label="平台确认">{time(item.confirmedAt)}</DetailItem>
          <DetailItem label="时区">北京时间</DetailItem>
        </DetailList>
      </section>

      <Disclosure title="记录标识与执行证据" className="border-t pt-3">
        <DetailList>
          <DetailItem label="记录 ID">{item.id}</DetailItem>
          <DetailItem label="发送身份">
            {item.senderId ?? "未保存"} · {item.senderNameSource}
          </DetailItem>
          <DetailItem label="收件人 ID">{item.recipientId ?? "未保存"}</DetailItem>
          <DetailItem label="帖子 ID">{item.postId ?? "未保存"}</DetailItem>
          <DetailItem label="原评论 ID">{item.commentId ?? "未保存"}</DetailItem>
          <DetailItem label="新回复 ID / 回执">
            {item.platformReceipt ?? "尚无可靠回执"}
          </DetailItem>
          <DetailItem label="原额度日">{item.day}</DetailItem>
        </DetailList>
        <Disclosure title={`阶段日志（${item.executionEvidence.length} 条）`}>
          {item.executionEvidence.length ? (
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-caption whitespace-pre-wrap break-words">
              {JSON.stringify(item.executionEvidence, null, 2)}
            </pre>
          ) : (
            <p className="text-muted-foreground">无阶段证据。</p>
          )}
        </Disclosure>
      </Disclosure>
    </div>
  );
}
