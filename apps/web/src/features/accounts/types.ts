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
  loginStatus?: string;
  sessionReference?: {deviceId:string;provider:string;state:string;verifiedAt:string|null}|null;
  loginProvider?: string | null;
  loginNickname?: string | null;
  loginPlatformUserId?: string | null;
  loginVerifiedAt?: string | null;
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

export const loginStatusLabel:Record<string,string>={CHECKING:'正在检查登录',CONNECTION_ERROR:'连接异常，未确认登录',RATE_LIMITED:'平台限流',RESTRICTED:'平台限制',VERIFIED:'登录已验证',OFFLINE_VERIFIED:'离线模拟已验证',UNVERIFIED:'本机会话待验证',MISSING:'本机会话缺失',EXPIRED:'本机会话已失效',DEVICE_MISMATCH:'需在原设备核验',NEEDS_REVIEW:'会话需人工核查',LEGACY_UNMAPPED:'历史记录 · 待人工关联',NOT_CONNECTED:'未验证登录'};
