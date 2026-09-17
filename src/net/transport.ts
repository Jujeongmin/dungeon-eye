export interface CallOptions {
  needResponse?: boolean;
  throttle?: number;
  throttleKey?: string;
}

export interface RoomUser {
  account: string;
  pose?: { x: number; z: number; yaw: number; at?: number };
}

export interface MatchTransport {
  readonly account: string;
  call<T = unknown>(name: string, args?: unknown[], options?: CallOptions): Promise<T>;
  subscribeRoomState(roomId: string, cb: (state: Record<string, unknown>) => void): () => void;
  subscribeRoomUsers(roomId: string, cb: (users: RoomUser[]) => void): () => void;
  onRoomMessage(roomId: string, type: string, cb: (message: unknown) => void): () => void;
}
