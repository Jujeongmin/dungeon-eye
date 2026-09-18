import { useEffect, useState } from "react";
import { HEARTBEAT_MS, type FriendsView } from "../game/account/friends";
import { FriendsClient } from "../net/friends";
import type { MatchTransport } from "../net/transport";

// Lives for the whole app, not just the menu, so friends still see you online during a match.
export function useFriends(transport: MatchTransport | null) {
  const [client, setClient] = useState<FriendsClient | null>(null);
  const [view, setView] = useState<FriendsView | null>(null);

  useEffect(() => {
    setClient(null);
    setView(null);
    if (!transport) return;
    const next = new FriendsClient(transport);
    const off = next.onChange(setView);
    setClient(next);
    void next.start().catch(() => undefined);
    const beat = window.setInterval(() => void next.sync().catch(() => undefined), HEARTBEAT_MS);
    return () => {
      window.clearInterval(beat);
      off();
      next.dispose();
    };
  }, [transport]);

  return { client, view };
}
