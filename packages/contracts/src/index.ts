import { z } from "zod";
export const protocolVersion = 1 as const;
export const healthTask = z
  .object({
    version: z.literal(protocolVersion),
    id: z.string().min(1),
    type: z.literal("HEALTHCHECK"),
    accountStatus: z.enum(["UNCONNECTED", "PAUSED", "RESTRICTED"]),
  })
  .strict();
export type HealthTask = z.infer<typeof healthTask>;
export const healthResult = z
  .object({
    version: z.literal(1),
    taskId: z.string(),
    status: z.literal("SKIPPED"),
    reason: z.literal("PLATFORM_CALLS_DISABLED"),
  })
  .strict();

export const internalJob = z.object({version:z.literal(1),type:z.literal("HEALTHCHECK")}).strict();
