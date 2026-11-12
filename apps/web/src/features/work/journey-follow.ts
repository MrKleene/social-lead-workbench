import type { JourneyStage } from "./journey-model";

/**
 * 一次挂载内对一个阶段的观察记录。
 *
 * `key` 用来区分轮次：换轮次（或换阶段）就丢弃旧观察，避免把上一轮的状态当成这一轮的跃迁。
 */
export type StageFollow = {
  key: string;
  /** 是否亲眼看到过这个阶段在跑。没看到过就不推进——否则打开一个历史轮次会自己往下跳。 */
  armed: boolean;
  /** 是否已经跟随过一次，防止重复推进。 */
  consumed: boolean;
};

/**
 * 判断「这一步刚做完，是否该自动进入下一步」。
 *
 * 规则只有一条：**只跟随本次挂载中观察到的跃迁**。先看到该阶段在跑（`active`），
 * 再看到它就绪（`ready`），并且用户此刻仍停在这一步（`stage === from`），才返回
 * `advance: true`。第一次观察只记录基线：
 *
 * - 打开一个已经在跑的任务 → `armed`，做完时自动进下一步；
 * - 打开一个早就做完的历史轮次 → 直接 `consumed`，页面停在你点开的那一步；
 * - 用户自己点去别的步骤 → `stage !== from`，不抢他的导航。
 *
 * 这套语义在 2026-11 的旧工作台里存在过（`journey-follow.ts`），随旧 web 面一起被删；
 * 这里是同语义的重写，不是新设计。
 */
export function followStage(
  previous: StageFollow | undefined,
  next: {
    key: string;
    active: boolean;
    ready: boolean;
    stage: JourneyStage;
    from: JourneyStage;
  },
): { follow: StageFollow; advance: boolean } {
  if (!previous || previous.key !== next.key) {
    return {
      follow: {
        key: next.key,
        armed: next.active,
        consumed: !next.active && next.ready,
      },
      advance: false,
    };
  }
  if (previous.consumed) return { follow: previous, advance: false };
  if (next.active) return { follow: { ...previous, armed: true }, advance: false };
  if (previous.armed && next.ready && next.stage === next.from) {
    return { follow: { ...previous, consumed: true }, advance: true };
  }
  return { follow: previous, advance: false };
}
