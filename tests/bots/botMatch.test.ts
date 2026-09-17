import { afterEach, describe, expect, it, vi } from "vitest";
import { LEVEL_1, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";
import { PracticeSession } from "../../src/net/practice";

const layout = parseLevel(LEVEL_1, TILE_SIZE);
const DT = 0.1;

afterEach(() => {
  vi.useRealTimers();
});

async function runUntilEnd(session: PracticeSession, maxSeconds: number): Promise<number> {
  for (let t = 0; t < maxSeconds; t += DT) {
    vi.advanceTimersByTime(DT * 1000);
    session.update(DT, null);
    await session.world.idle();
    await Promise.resolve();
    if (session.human.state.phase === "ended") return t;
  }
  return Number.POSITIVE_INFINITY;
}

describe("practice session", () => {
  it("fills a room with the player and three bots", async () => {
    const session = new PracticeSession(layout);
    await session.start();
    const match = session.human.state.match!;
    expect(match.players).toEqual(["test-you", "test-bot-1", "test-bot-2", "test-bot-3"]);
    expect(session.human.state.phase).toBe("playing");
    expect(session.human.state.you.role).not.toBeNull();
    session.dispose();
  });

  it("plays a whole match to the end with bots on every seat", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const session = new PracticeSession(layout, { autopilot: true });
    await session.start();
    const endedAt = await runUntilEnd(session, 9 * 60);
    session.dispose();

    expect(endedAt).toBeLessThan(9 * 60);
    const match = session.human.state.match!;
    expect(match.phase).toBe("ended");
    expect(["escaped", "wiped", "timeout"]).toContain(match.result!.reason);
    expect(match.results).toHaveLength(4);
    const moved = Object.values(match.monsters).some((m) => m.x !== 34 || m.z !== 14);
    expect(moved || match.result!.reason === "escaped").toBe(true);
  }, 60_000);
});
