import {
  Controller,
  Inject,
  Module,
  Req,
  Sse,
  UseGuards,
  MessageEvent,
  OnModuleDestroy,
} from "@nestjs/common";
import { interval, from, mergeMap, Observable, takeWhile, map, ReplaySubject, takeUntil } from "rxjs";
import { AuthModule, AuthedRequest, SessionGuard } from "../auth/auth";
import { Db } from "./db";
@Controller("events")
@UseGuards(SessionGuard)
class EventsController implements OnModuleDestroy {
  private readonly stopping = new ReplaySubject<void>(1);
  // SSE responses must finish before Nest closes its HTTP server. Otherwise an
  // open browser tab holds graceful shutdown until the launcher timeout.
  onModuleDestroy() { this.stopping.next(); this.stopping.complete(); }
  constructor(@Inject(Db) private db: Db) {}
  @Sse() stream(@Req() req: AuthedRequest): Observable<MessageEvent> {
    // No lead payload on the stream. Client refetches through current server permissions.
    // Recheck revocation/expiry on each tick, so logout closes open streams.
    return interval(15000).pipe(
      mergeMap(() =>
        from(
          this.db.session.findUnique({
            where: { id: req.sessionId },
            include: { user: { select: { active: true } } },
          }),
        ),
      ),
      takeWhile((s) => !!s && s.expiresAt > new Date() && s.user.active),
      map(() => ({ type: "refresh", data: { at: new Date().toISOString() } })),
      takeUntil(this.stopping),
    );
  }
}
@Module({ imports: [AuthModule], controllers: [EventsController] })
export class EventsModule {}
