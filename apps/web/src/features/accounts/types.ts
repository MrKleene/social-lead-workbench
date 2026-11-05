export type Account = {
  id: string;
  platform: "XHS" | "DOUYIN";
  label: string;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  dailyLimit: number;
  todayLimit?: number;
  occupied: number;
  day: string;
  status: "UNCONNECTED" | "PAUSED" | "RESTRICTED";
  pauseReason: string | null;
  systemBlockReason?: string | null;
  available: boolean;
  isDemo?: boolean;
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
export const accountStatus = {
  UNCONNECTED: "模拟可分配",
  PAUSED: "已暂停",
  RESTRICTED: "受限 · 待处理",
};

export const loginStatusLabel:Record<string,string>={PREVIOUSLY_VERIFIED:'上次验证通过',CHECKING:'正在检查登录',CONNECTION_ERROR:'连接异常，未确认登录',RATE_LIMITED:'平台限流',RESTRICTED:'平台限制',VERIFIED:'上次验证通过',OFFLINE_VERIFIED:'离线模拟已验证',UNVERIFIED:'登录待核验，执行时自动检查',MISSING:'本机会话缺失',EXPIRED:'登录已失效',DEVICE_MISMATCH:'需在原设备核验',NEEDS_REVIEW:'身份或会话待核查',LEGACY_UNMAPPED:'历史记录 · 待人工关联',NOT_CONNECTED:'未验证登录'};
