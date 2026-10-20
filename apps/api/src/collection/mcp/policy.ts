import { z } from 'zod';
import { ReadFailure } from '../contract';
export const mcpModes = ['XHS_FIXTURE', 'XHS_MCP'] as const;
export type McpMode = typeof mcpModes[number];
export const toolArguments = {
  check_login_status: z.object({}).strict(),
  search_feeds: z.object({ keyword: z.string().trim().min(1).max(40) }).strict(),
  get_feed_detail: z.object({ feed_id: z.string().min(1).max(200), xsec_token: z.string().min(1).max(4096), load_all_comments: z.literal(false), click_more_replies: z.literal(false) }).strict(),
};
export type ReadTool = keyof typeof toolArguments;
export function endpointUrl(value: string): URL {
  // Canonical numeric loopback only: no DNS/rebinding, credentials, alternate IP encodings or proxy destinations.
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}\/mcp$/.test(value)) throw new ReadFailure('ENDPOINT_INVALID');
  const port = Number(value.split(":")[2].split("/")[0]);
  if (port < 1024 || port > 65535 || [18060, 18061].includes(port)) throw new ReadFailure('ENDPOINT_INVALID');
  return new URL(value);
}
export function mcpSettings(env: NodeJS.ProcessEnv = process.env) {
  if (env.XHS_MCP_ENABLED !== '1') return { enabled: false as const, reason: 'REAL_DISABLED' as const };
  const mode: McpMode | undefined = env.XHS_MCP_PROFILE === 'fixture' ? 'XHS_FIXTURE' : env.XHS_MCP_PROFILE === 'real' ? 'XHS_MCP' : undefined;
  if (!mode) return { enabled: false as const, reason: 'ENDPOINT_INVALID' as const };
  try { return { enabled: true as const, mode, url: endpointUrl(env.XHS_MCP_ENDPOINT || '') }; }
  catch { return { enabled: false as const, reason: 'ENDPOINT_INVALID' as const }; }
}
export function requireMcp(mode: string) {
  const settings = mcpSettings();
  if (!settings.enabled) throw new ReadFailure(settings.reason);
  if (settings.mode !== mode) throw new ReadFailure('PROFILE_MISMATCH');
  return settings;
}

export function loginCheckOnly(env: NodeJS.ProcessEnv = process.env) { return env.XHS_MCP_LOGIN_ONLY === "1"; }
