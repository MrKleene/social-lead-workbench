import type {Assessment} from '@crm/contracts';
export type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALES";
};
export type Platform = "XHS" | "DOUYIN";
export const platformLabel: Record<Platform, string> = {
  XHS: "小红书",
  DOUYIN: "抖音",
};
export const formatDate = (date: string | null) =>
  date
    ? new Date(date).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "暂未安排";
