import "dotenv/config";
import { Db } from "../apps/api/src/common/db";
import { SourcesService } from "../apps/api/src/sources/sources";
const db = new Db();
const sources = new SourcesService(db);
async function main() {
  const summaries = [
    "想了解产品价格和部署方式",
    "需要对接现有系统",
    "想试用并了解功能",
    "关注数据安全与权限",
    "需要跨平台线索汇总",
    "了解收费模式",
  ];
  const texts = [
    "【虚构】请问企业版如何本地部署？希望了解费用。",
    "【虚构】已有 CRM，可以对接并迁移数据吗？",
    "【虚构】想试用线索管理功能，可以介绍吗？",
    "【虚构】团队如何分配权限，数据能留在本地吗？",
    "【虚构】需要多平台统一跟进，怎样避免同名误合并？",
    "【虚构】请问团队版有哪些收费方式？",
  ];
  for (let i = 0; i < 6; i++) {
    const lead = await sources.ingestDemo({
      platform: i % 2 ? "DOUYIN" : "XHS",
      userId: `demo-user-${i + 1}`,
      nickname: `演示用户0${i + 1}`,
      postId: `demo-post-${i % 2}`,
      postTitle: "【虚构示例】团队客户管理讨论",
      commentId: `demo-comment-${i + 1}`,
      originalText: texts[i],
      summary: summaries[i],
    });
    if (!(await db.task.count({ where: { leadId: lead.id } })))
      await db.task.create({
        data: { leadId: lead.id, title: "人工核对求助原文与需求（虚构）" },
      });
  }
  for (const platform of ["XHS", "DOUYIN"] as const)
    if (
      !(await db.platformAccount.count({ where: { platform, isDemo: true } }))
    )
      await db.platformAccount.create({
        data: {
          platform,
          label:
            platform === "XHS"
              ? "小红书 · 虚构连接占位"
              : "抖音 · 虚构连接占位",
          status: "UNCONNECTED",
          isDemo: true,
        },
      });
  console.log(
    "已写入 6 条虚构线索和人工核验任务。未创建登录用户；未连接任何平台。",
  );
}
main()
  .catch(() => {
    console.error("种子失败，请检查数据库迁移");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
