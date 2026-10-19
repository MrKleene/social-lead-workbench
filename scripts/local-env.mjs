import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
if (existsSync(".env")) {
  console.error(".env 已存在，未覆盖");
  process.exit(1);
}
const password = randomBytes(32).toString("hex");
writeFileSync(
  ".env",
  `POSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://crm:${password}@127.0.0.1:55432/crm?schema=public\nREDIS_URL=redis://127.0.0.1:56379\nAPP_ORIGIN=http://127.0.0.1:5173\nCOOKIE_SECURE=false\n`,
  { mode: 0o600 },
);
console.log(
  "已生成仅本机可读的 .env；数据库随机凭据未打印。管理员请用 npm run admin:init 初始化。",
);
