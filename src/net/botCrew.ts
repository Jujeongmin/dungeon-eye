import { BotBrain } from "../game/bots/botBrain";
import { isBot } from "../game/match/lifecycle";
import type { PrivateView } from "../game/match/view";
import type { LevelLayout } from "../game/rules/levelLayout";
import { BotTransport } from "./botTransport";
import { MatchClient } from "./matchClient";
import type { MatchTransport } from "./transport";

interface Seat {
  client: MatchClient;
  brain: BotBrain;
}

// Runs the online fill bots on the host's client, the same brains practice mode uses.
// Every client has one; only the current host's does anything, so when the host drops out the next one takes over.
export class BotCrew {
  private readonly seats = new Map<string, Seat>();

  constructor(
    private readonly host: MatchClient,
    private readonly transport: MatchTransport,
    private readonly layout: LevelLayout,
  ) {}

  get driving(): string[] {
    return [...this.seats.keys()];
  }

  views(): PrivateView[] {
    return [...this.seats.values()].map((seat) => seat.client.state.you);
  }

  update(dt: number): void {
    const { phase, match, roomId } = this.host.state;
    if (phase !== "playing" || !match || !roomId || this.host.host() !== this.transport.account) {
      this.clear();
      return;
    }
    for (const bot of match.players.filter(isBot)) {
      if (this.seats.has(bot)) continue;
      const client = new MatchClient(new BotTransport(this.transport, bot));
      void client.attach(roomId);
      this.seats.set(bot, { client, brain: new BotBrain(client, this.layout) });
    }
    for (const seat of this.seats.values()) seat.brain.update(dt);
  }

  dispose(): void {
    this.clear();
  }

  private clear(): void {
    for (const seat of this.seats.values()) seat.client.dispose();
    this.seats.clear();
  }
}
