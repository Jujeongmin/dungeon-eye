function short(name: string): string {
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

// A player's nickname as shown on screen, including your own.
export function displayName(account: string, me: string): string {
  if (account === me) return ownName(account);
  // Practice bots ("test-bot-N") and the online lobby's fill bots ("bot-N").
  const bot = /^(?:test-)?bot-(\d+)$/.exec(account);
  if (bot) return `봇 ${bot[1]}`;
  return short(account);
}

// What you are called on your own screen.
export function ownName(account: string): string {
  if (account === "test-you") return "플레이어";
  return short(account);
}
