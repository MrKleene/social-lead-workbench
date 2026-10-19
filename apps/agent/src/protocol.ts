import {healthTask as taskSchema} from "@crm/contracts";
export {healthTask as taskSchema} from "@crm/contracts";
export function handleTask(input: unknown) {
  const task = taskSchema.parse(input);
  return {
    version: 1,
    taskId: task.id,
    status: "SKIPPED",
    reason: "PLATFORM_CALLS_DISABLED",
  } as const;
}
export function validateMcpUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("仅允许无凭据的本机 HTTP MCP 地址");
  return url;
}
