import { useEffect, useState } from "react";
import { HEARTBEAT_MS } from "../game/account/friends";
import type { Activity, PartyView } from "../game/account/party";
import { PartyClient } from "../net/party";
import type { MatchTransport } from "../net/transport";
import { myCostume, onMyCostume } from "./profile";

// Lives for the whole app like useFriends; also tells the server your costume so the party sees it.
export function useParty(transport: MatchTransport | null, activity: Activity) {
  const [client, setClient] = useState<PartyClient | null>(null);
  const [view, setView] = useState<PartyView | null>(null);

  useEffect(() => {
    setClient(null);
    setView(null);
    if (!transport) return;
    const next = new PartyClient(transport);
    const off = next.onChange(setView);
    setClient(next);
    const wear = (id: string) => void next.setCostume(id).catch(() => undefined);
    wear(myCostume().id);
    const offCostume = onMyCostume((c) => wear(c.id));
    void next.start().catch(() => undefined);
    const beat = window.setInterval(() => void next.sync().catch(() => undefined), HEARTBEAT_MS);
    return () => {
      window.clearInterval(beat);
      offCostume();
      off();
      next.dispose();
    };
  }, [transport]);

  useEffect(() => {
    void client?.setActivity(activity).catch(() => undefined);
  }, [client, activity]);

  return { client, view };
}
