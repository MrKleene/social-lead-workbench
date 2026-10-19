import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app";
import { configure } from "./bootstrap";
async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configure(app);
  await app.listen(
    Number(process.env.PORT || 3100),
    process.env.API_HOST || "127.0.0.1",
  );
}
main().catch(() => {
  console.error("API 启动失败，请检查本地数据库配置");
  process.exit(1);
});
