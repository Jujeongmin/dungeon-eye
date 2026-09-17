import { stepMonsterAi } from "../game/match/monsterAi";
import type { Pose, Poses } from "../game/match/types";
import { solidAt, type LevelLayout } from "../game/rules/levelLayout";
import type { MatchClient } from "./matchClient";

export class HostDirector {
  private attacking = false;

  constructor(
    private readonly client: MatchClient,
    private readonly layout: LevelLayout,
  ) {}

  update(dt: number, ownPose: Pose | null): void {
    const { phase, match, poses } = this.client.state;
    if (phase !== "playing" || !match || this.client.host() !== this.client.account) return;
    const all: Poses = { ...poses };
    if (ownPose) all[this.client.account] = ownPose;
    const step = stepMonsterAi(match, all, (x, z) => solidAt(this.layout, x, z), dt, this.client.serverNow(), () => false);
    this.client.reportMonsters(step.updates);
    const order = step.attacks[0];
    if (order && !this.attacking) {
      this.attacking = true;
      void this.client.attackWithMonster(order.monsterId, order.target).finally(() => {
        this.attacking = false;
      });
    }
  }
}
