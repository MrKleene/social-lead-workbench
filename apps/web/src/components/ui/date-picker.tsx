"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { zhCN } from "react-day-picker/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * 日期选择器（shadcn 官方组合：`Popover` + `Calendar`）。
 *
 * 值用 `YYYY-MM-DD` 字符串，与后端和 URL 参数一致，**不传 `Date` 对象**——
 * `new Date("2026-11-01")` 会按 UTC 解析，在东八区变成 10 月 31 日 16:00，
 * 日期会整体偏移一天。这里手工按本地时区构造。
 *
 * 触发器不用 `Button variant="outline"`：那个变体带 `shadow-xs` 和
 * `bg-background`，与 `Input` 的 `bg-card`、无阴影不一致。这里直接复用
 * `Input` 的度量（h-9 / rounded-md / border-input / bg-card / ps-3 pe-9）。
 */
function parseISO(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toISO(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDate(value: string) {
  const date = parseISO(value);
  if (!date) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "选择日期",
  ariaLabel,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card ps-3 pe-9 text-base whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {value ? formatDate(value) : placeholder}
          </span>
          <CalendarIcon className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={zhCN}
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected}
          autoFocus
          onSelect={(date) => {
            onChange(date ? toISO(date) : "");
            setOpen(false);
          }}
        />
        {value ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              清除日期
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
