import "dotenv/config";
import { input, password, confirm } from "@inquirer/prompts";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../apps/api/src/auth/security";
const db = new PrismaClient();
async function main() {
  if (!process.stdin.isTTY)
    throw new Error("请在本机交互终端运行；不接受命令行或环境变量密码");
  const role = process.argv[2] === "admin" ? "ADMIN" : "SALES";
  if (role === "ADMIN" && (await db.user.count({ where: { role: "ADMIN" } })))
    throw new Error("管理员已初始化，拒绝覆盖");
  console.log(`创建本地 CRM ${role === "ADMIN" ? "管理员" : "销售"}账号；用于登录工作台网页，与小红书账号无关，不发送邮件。`);
  const email = (
    await input({
      message: "新建 CRM 账号的登录邮箱",
      validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "请输入有效邮箱",
    })
  ).toLowerCase();
  const name = await input({
    message: "显示名称",
    validate: (v) =>
      (v.trim().length > 0 && v.length <= 80) || "请输入 1–80 字名称",
  });
  const secret = await password({
    message: "设置 CRM 登录密码（至少 12 字符，隐藏输入）",
    mask: true,
    validate: (v) =>
      (v.length >= 12 && v.length <= 256) || "密码需为 12–256 字符",
  });
  const again = await password({ message: "再次输入密码", mask: true });
  if (secret !== again) throw new Error("两次密码不同");
  if (
    !(await confirm({
      message: `创建 ${role === "ADMIN" ? "管理员" : "销售"} ${email}？`,
    }))
  )
    return;
  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name, role, passwordHash: await hashPassword(secret) },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "LOCAL_USER_INITIALIZED",
        entityId: user.id,
      },
    });
  });
  console.log("用户创建成功，密码未写入日志。");
}
main()
  .catch((e) => {
    console.error(
      e instanceof Error && !("code" in e)
        ? e.message
        : "初始化失败，请检查数据库和邮箱是否重复",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
