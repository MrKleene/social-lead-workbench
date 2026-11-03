import {HistoryArchiveModule} from './history-archive/history-archive.module';
import "reflect-metadata";
import { DirectMessagesModule } from "./direct-messages/direct-messages.module";
import { AccountsModule } from "./accounts/accounts";
import { RepliesModule } from "./replies/replies";
import { Controller, Get, Module, Inject, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseModule, Db } from "./common/db";
import { AuthModule } from "./auth/auth";
import { UsersModule } from "./users/users";
import { LeadsModule } from "./leads/leads";
import { FollowupsModule } from "./followups/followups";
import { SourcesModule } from "./sources/sources";
import { TasksModule } from "./tasks/tasks";
import { AuditModule } from "./audit/audit";
import { PlatformsModule } from "./platforms/platforms";
import { AgentsModule } from "./agents/agents";
import { CollectionModule } from "./collection/module";
import { EventsModule } from "./common/events";
@Controller("health")
class HealthController {
  constructor(@Inject(Db) private db: Db) {}
  @Get("ready") async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return {ok:true,database:"ready",platformCallsEnabled:false};
    } catch {
      throw new ServiceUnavailableException("数据库尚未就绪");
    }
  }
  @Get() get() {
    return { ok: true, milestone: 1, platformCallsEnabled: false, accountCenter: true, contactWorkflow: true, replyTemplates: true };
  }
}
@Module({
  imports: [
    DatabaseModule,
    HistoryArchiveModule,
    AccountsModule,
    RepliesModule,
    DirectMessagesModule,
    AuthModule,
    UsersModule,
    LeadsModule,
    FollowupsModule,
    SourcesModule,
    TasksModule,
    AuditModule,
    PlatformsModule,
    AgentsModule,
    EventsModule,
    CollectionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
