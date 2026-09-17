export const PLAYERS = ["test-a", "test-b", "test-c", "test-d"];

export function actAs(server: any, account: string, roomId: string): void {
  server.connect({ account, roomId });
}

export async function fillRoom(server: any): Promise<string> {
  let roomId = "";
  for (const account of PLAYERS) {
    server.connect({ account });
    roomId = (await server.findMatch()).roomId;
  }
  return roomId;
}

export async function findTraitor(server: any, roomId: string): Promise<string> {
  for (const account of PLAYERS) {
    actAs(server, account, roomId);
    if ((await server.getMatchState()).you.role === "traitor") return account;
  }
  throw new Error("no traitor in room " + roomId);
}

export async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error: any) {
    return String(error?.message ?? error);
  }
}

export async function placeAll(server: any, roomId: string, spots: Record<string, { x: number; z: number }>): Promise<void> {
  for (const account of Object.keys(spots)) {
    actAs(server, account, roomId);
    await server.reportPose({ x: spots[account].x, z: spots[account].z, yaw: 0 });
  }
}

export interface Sent { type: string; account?: string; message: any }

export function captureMessages(): { sent: Sent[]; restore: () => void } {
  const sent: Sent[] = [];
  const direct = $room.sendMessageToUser;
  const broadcast = $room.broadcastToRoom;
  $room.sendMessageToUser = (type: string, account: string, message: any) => {
    sent.push({ type, account, message });
  };
  $room.broadcastToRoom = (type: string, message: any) => {
    sent.push({ type, message });
  };
  return {
    sent,
    restore: () => {
      $room.sendMessageToUser = direct;
      $room.broadcastToRoom = broadcast;
    },
  };
}

export async function roomMatch(roomId: string): Promise<any> {
  return (await $global.getRoomState(roomId)).match;
}
