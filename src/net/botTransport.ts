import type { CallOptions, MatchTransport, RoomUser } from "./transport";

// One bot's side of the connection. A bot has no connection of its own, so its calls go through
// the host's as botCall, and it shares the host's view of the room.
export class BotTransport implements MatchTransport {
  constructor(
    private readonly host: MatchTransport,
    readonly account: string,
  ) {}

  call<T = unknown>(name: string, args: unknown[] = [], options: CallOptions = {}): Promise<T> {
    return this.host.call<T>("botCall", [this.account, name, args], {
      ...options,
      throttleKey: `${this.account}:${options.throttleKey ?? name}`,
    });
  }

  subscribeRoomState(roomId: string, cb: (state: Record<string, unknown>) => void): () => void {
    return this.host.subscribeRoomState(roomId, cb);
  }

  subscribeRoomUsers(roomId: string, cb: (users: RoomUser[]) => void): () => void {
    return this.host.subscribeRoomUsers(roomId, cb);
  }

  // Messages sent to the host ("private", "pain") are the host's, not the bot's; only room-wide ones are shared.
  onRoomMessage(roomId: string, type: string, cb: (message: unknown) => void): () => void {
    return type === "possession" ? this.host.onRoomMessage(roomId, type, cb) : () => {};
  }

  subscribeMyState(): () => void {
    return () => {};
  }
}
