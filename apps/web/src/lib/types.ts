export type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALES";
};
export type Platform = "XHS" | "DOUYIN";
export type LeadStatus = "PENDING_REVIEW" | "FOLLOWING" | "CLOSED";
export type ContactStage = "MATCHED" | "TO_CONTACT" | "CONTACTED" | "INTERESTED" | "IGNORED";
export type Lead = {
  contactStage?: ContactStage;
  contactNote?: string | null;
  contactedAt?: string | null;
  id: string;
  summary: string;
  evidence: string;
  identity: {
    nickname: string;
    platform: Platform;
    platformUserId: string;
    comments?: {
      id: string;
      originalText: string;
      platformCommentId: string;
      parentPlatformCommentId?: string | null;
      matches?: {keywords:string[];classification:string;isBaseline:boolean}[];
      post: { title: string; platformPostId: string };
    }[];
  };
  owner: { id: string; name: string } | null;
  status: LeadStatus;
  reviewedAt: string | null;
  reviewNote: string | null;
  nextFollowUpAt: string | null;
  isDemo: boolean;
  version: number;
  followups?: {
    id: string;
    content: string;
    createdAt: string;
    author: { name: string };
    nextFollowUpAt: string | null;
  }[];
};
export type Task = {
  id: string;
  title: string;
  kind: string;
  status: "PENDING" | "DONE" | "PAUSED";
  dueAt: string | null;
  lead: {
    id: string;
    summary: string;
    identity: { nickname: string };
    owner: { name: string } | null;
  };
};
export const statusLabel: Record<LeadStatus, string> = {
  PENDING_REVIEW: "待确认",
  FOLLOWING: "跟进中",
  CLOSED: "已关闭",
};
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
