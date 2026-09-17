import type { GameServer } from "@agent8/gameserver";
import type { CallOptions, MatchTransport, RoomUser } from "./transport";

export type Verse8Server = Pick<
  GameServer, "account" | "remoteFunction" | "subscribeRoomState" | "subscribeRoomAllUserStates" | "onRoomMessage"
>;

export class Verse8Transport implements MatchTransport {
  constructor(private readonly server: Verse8Server) {}

  get account(): string {
    return this.server.account;
  }

  call<T = unknown>(name: string, args: unknown[] = [], options: CallOptions = {}): Promise<T> {
    return this.server.remoteFunction(name, args, options) as Promise<T>;
  }

  subscribeRoomState(roomId: string, cb: (state: Record<string, unknown>) => void): () => void {
    return this.server.subscribeRoomState(roomId, cb);
  }

  subscribeRoomUsers(roomId: string, cb: (users: RoomUser[]) => void): () => void {
    return this.server.subscribeRoomAllUserStates(roomId, cb);
  }

  onRoomMessage(roomId: string, type: string, cb: (message: unknown) => void): () => void {
    return this.server.onRoomMessage(roomId, type, cb);
  }
}
