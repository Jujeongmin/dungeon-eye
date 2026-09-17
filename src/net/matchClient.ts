import { PROTOCOL_VERSION } from "../game/match/constants";
import type { MonsterPoseUpdate } from "../game/match/damage";
import { isActive } from "../game/match/lifecycle";
import { RULE_ERRORS, type Pose, type PublicMatch, type Stage } from "../game/match/types";
import type { PrivateView } from "../game/match/view";
import type { MatchTransport, RoomUser } from "./transport";

export type ClientPhase = "idle" | "searching" | "lobby" | "playing" | "ended" | "error";

export interface MatchSnapshot {
  roomId: string;
  serverNow: number;
  match: PublicMatch;
  you: PrivateView;
}

export interface ClientState {
  phase: ClientPhase;
  roomId: string | null;
  match: PublicMatch | null;
  you: PrivateView;
  poses: Record<string, Pose>;
  error: string | null;
}

export interface PainEvent { x: number; z: number }
export interface PossessionEvent { monsterId: string; active: boolean; endsAt: number | null }

export const NO_VIEW: PrivateView = { role: null, hp: null, possession: null, possessReadyAt: null };
export const POSE_THROTTLE_MS = 100;
export const MONSTER_THROTTLE_MS = 150;
export const SYNC_INTERVAL_MS = 1000;
const OWN_MONSTER_HOLD_MS = 500;

export function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
  return RULE_ERRORS.find((code) => message.includes(code)) ?? message;
}

function isPose(value: unknown): value is Pose {
  const p = value as Partial<Pose> | undefined;
  return !!p && [p.x, p.z, p.yaw].every((n) => typeof n === "number" && Number.isFinite(n));
}

export class MatchClient {
  private current: ClientState = { phase: "idle", roomId: null, match: null, you: NO_VIEW, poses: {}, error: null };
  private offsetMs = 0;
  private lastSyncAt = -Infinity;
  private refreshing = false;
  private unsubscribers: (() => void)[] = [];
  private readonly reported = new Map<string, number>();
  private readonly changeListeners = new Set<(s: ClientState) => void>();
  private readonly painListeners = new Set<(e: PainEvent) => void>();
  private readonly possessionListeners = new Set<(e: PossessionEvent) => void>();

  constructor(
    private readonly transport: MatchTransport,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get account(): string {
    return this.transport.account;
  }

  get state(): ClientState {
    return this.current;
  }

  serverNow(): number {
    return this.now() + this.offsetMs;
  }

  onChange(cb: (s: ClientState) => void): () => void {
    this.changeListeners.add(cb);
    return () => {
      this.changeListeners.delete(cb);
    };
  }

  onPain(cb: (e: PainEvent) => void): () => void {
    this.painListeners.add(cb);
    return () => {
      this.painListeners.delete(cb);
    };
  }

  onPossession(cb: (e: PossessionEvent) => void): () => void {
    this.possessionListeners.add(cb);
    return () => {
      this.possessionListeners.delete(cb);
    };
  }

  async join(): Promise<void> {
    this.set({ phase: "searching", error: null });
    try {
      const version = await this.transport.call<{ protocol: number }>("getServerVersion");
      if (version?.protocol !== PROTOCOL_VERSION) {
        throw new Error(`server protocol ${version?.protocol}, client protocol ${PROTOCOL_VERSION}`);
      }
      const { roomId } = await this.transport.call<{ roomId: string }>("findMatch");
      this.set({ roomId });
      this.listen(roomId);
      await this.refresh();
    } catch (error) {
      this.fail(error);
    }
  }

  async refresh(): Promise<void> {
    if (!this.current.roomId) return;
    const sentAt = this.now();
    const snap = await this.transport.call<MatchSnapshot>("getMatchState");
    const receivedAt = this.now();
    this.offsetMs = snap.serverNow - (sentAt + receivedAt) / 2;
    const you = snap.match.phase === "ended" && this.current.you.role ? this.current.you : snap.you;
    this.set({ roomId: snap.roomId, match: this.keepOwnMonsters(snap.match), you, phase: snap.match.phase });
  }

  host(): string | null {
    const match = this.current.match;
    return match ? (match.players.find((p) => isActive(match, p)) ?? null) : null;
  }

  tick(): void {
    if (this.current.phase !== "playing") return;
    const now = this.now();
    if (now - this.lastSyncAt < SYNC_INTERVAL_MS) return;
    this.lastSyncAt = now;
    void this.transport.call("syncMatch", [], { needResponse: false });
  }

  reportPose(pose: Pose): void {
    if (this.current.phase !== "playing" && this.current.phase !== "lobby") return;
    void this.transport.call("reportPose", [{ x: pose.x, z: pose.z, yaw: pose.yaw }], {
      needResponse: false, throttle: POSE_THROTTLE_MS,
    });
  }

  reportMonsters(updates: MonsterPoseUpdate[]): void {
    const match = this.current.match;
    if (updates.length === 0 || this.current.phase !== "playing" || !match) return;
    const monsters = { ...match.monsters };
    const now = this.now();
    for (const u of updates) {
      const monster = monsters[u.id];
      if (!monster) continue;
      monsters[u.id] = { ...monster, x: u.x, z: u.z, yaw: u.yaw };
      this.reported.set(u.id, now);
    }
    this.set({ match: { ...match, monsters } });
    void this.transport.call("reportMonsters", [updates], { needResponse: false, throttle: MONSTER_THROTTLE_MS });
  }

  possess(monsterId: string): Promise<string | null> {
    return this.actWithView("possess", [monsterId]);
  }

  release(): Promise<string | null> {
    return this.actWithView("release", []);
  }

  fireAtMonster(monsterId: string): Promise<string | null> {
    return this.act("fireAtMonster", [monsterId]);
  }

  attackWithMonster(monsterId: string, target: string): Promise<string | null> {
    return this.act("attackWithMonster", [monsterId, target]);
  }

  interact(): Promise<string | null> {
    return this.act("interact", []);
  }

  setStage(stage: Stage): Promise<string | null> {
    return this.act("devSetStage", [stage]);
  }

  escape(): Promise<string | null> {
    return this.act("escape", []);
  }

  advanceClock(ms: number): Promise<string | null> {
    return this.act("devAdvanceClock", [ms]);
  }

  async leave(): Promise<void> {
    try {
      if (this.current.roomId) await this.transport.call("leaveMatch");
    } catch {
      // Leaving is best effort: the server counts a vanished player as gone anyway.
    } finally {
      this.stopListening();
      this.set({ phase: "idle", roomId: null, match: null, you: NO_VIEW, poses: {}, error: null });
    }
  }

  dispose(): void {
    this.stopListening();
    this.changeListeners.clear();
    this.painListeners.clear();
    this.possessionListeners.clear();
  }

  private async act(name: string, args: unknown[]): Promise<string | null> {
    try {
      await this.transport.call(name, args);
      return null;
    } catch (error) {
      return errorCode(error);
    }
  }

  private async actWithView(name: string, args: unknown[]): Promise<string | null> {
    try {
      const view = await this.transport.call<PrivateView>(name, args);
      this.set({ you: view });
      return null;
    } catch (error) {
      return errorCode(error);
    }
  }

  private listen(roomId: string): void {
    this.stopListening();
    const t = this.transport;
    this.unsubscribers = [
      t.subscribeRoomState(roomId, (state) => this.onRoomState(state)),
      t.subscribeRoomUsers(roomId, (users) => this.onUsers(users)),
      t.onRoomMessage(roomId, "private", (m) => this.set({ you: m as PrivateView })),
      t.onRoomMessage(roomId, "pain", (m) => this.painListeners.forEach((l) => l(m as PainEvent))),
      t.onRoomMessage(roomId, "possession", (m) => this.possessionListeners.forEach((l) => l(m as PossessionEvent))),
    ];
  }

  private stopListening(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
  }

  private onRoomState(state: Record<string, unknown>): void {
    const match = state.match as PublicMatch | undefined;
    if (!match || match.version !== 1) return;
    this.set({ match: this.keepOwnMonsters(match), phase: match.phase });
    // Ticks cannot message players, so a possession ended by a vote shows up only here.
    const held = this.current.you.possession;
    const lost = held !== null && match.monsters[held.monsterId]?.possessed !== true;
    if (match.phase === "playing" && (this.current.you.role === null || lost) && !this.refreshing) {
      this.refreshing = true;
      this.refresh()
        .catch((error) => this.fail(error))
        .finally(() => {
          this.refreshing = false;
        });
    }
  }

  private onUsers(users: RoomUser[]): void {
    const poses: Record<string, Pose> = {};
    for (const user of users) {
      if (isPose(user.pose)) poses[user.account] = { x: user.pose.x, z: user.pose.z, yaw: user.pose.yaw };
    }
    this.set({ poses });
  }

  private keepOwnMonsters(match: PublicMatch): PublicMatch {
    const local = this.current.match;
    if (!local) return match;
    const now = this.now();
    let monsters = match.monsters;
    for (const [id, at] of this.reported) {
      if (now - at >= OWN_MONSTER_HOLD_MS) {
        this.reported.delete(id);
        continue;
      }
      const mine = local.monsters[id];
      const theirs = monsters[id];
      if (!mine || !theirs) continue;
      if (monsters === match.monsters) monsters = { ...match.monsters };
      monsters[id] = { ...theirs, x: mine.x, z: mine.z, yaw: mine.yaw };
    }
    return monsters === match.monsters ? match : { ...match, monsters };
  }

  private set(patch: Partial<ClientState>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of this.changeListeners) listener(this.current);
  }

  private fail(error: unknown): void {
    this.set({ phase: "error", error: error instanceof Error ? error.message : String(error) });
  }
}
