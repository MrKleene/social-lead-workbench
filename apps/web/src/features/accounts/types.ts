export type Account = {
  id: string;
  platform: "XHS" | "DOUYIN";
  label: string;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  dailyLimit: number;
  occupied: number;
  day: string;
  status: "UNCONNECTED" | "PAUSED" | "RESTRICTED";
  pauseReason: string | null;
  available: boolean;
  version: number;
};
export type AccountList = {
  accounts: Account[];
  summary: { available: number; attention: number };
};
export type Attempt = {
  id: string;
  kind: "FIRST" | "FOLLOWUP";
  outcome: "ATTEMPTED" | "UNKNOWN" | "FAILED" | "SIMULATED_SUCCESS";
  version: number;
  day: string;
  resolutionNote: string | null;
};
export type ContactState = {
  firstContactSimulated: boolean;
  ledger: null | {
    accountId: string;
    account: { label: string };
    attempts: Attempt[];
  };
  doNotContact: boolean;
  identityReady: boolean;
  manuallyRecorded: boolean;
  reviewed: boolean;
  platformConfirmed: false;
};
export const outcomes = {
  ATTEMPTED: "模拟尝试 · 已预留",
  UNKNOWN: "结果未知 · 阻止重复",
  FAILED: "已核查失败 · 释放额度",
  SIMULATED_SUCCESS: "模拟确认成功 · 非平台回执",
};
export const accountStatus = {
  UNCONNECTED: "模拟可分配",
  PAUSED: "已暂停",
  RESTRICTED: "受限 · 待处理",
};
