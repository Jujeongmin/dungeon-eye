export function displayName(account: string, me: string): string {
  if (account === me) return "나";
  const bot = /^test-bot-(\d+)$/.exec(account);
  if (bot) return `봇 ${bot[1]}`;
  return account.length > 12 ? `${account.slice(0, 11)}…` : account;
}
