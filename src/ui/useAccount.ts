import { useCallback, useEffect, useState } from "react";
import type { AccountView } from "../game/account/nickname";
import { loadAccount, saveNickname } from "../net/account";
import type { MatchTransport } from "../net/transport";

// Your server-side account while on the menu; null transport means offline.
export function useAccount(transport: MatchTransport | null) {
  const [view, setView] = useState<AccountView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setView(null);
    setFailed(false);
    if (!transport) return;
    let live = true;
    loadAccount(transport).then(
      (next) => live && setView(next),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [transport]);

  const save = useCallback(async (nickname: string) => {
    if (!transport) throw new Error("offline");
    setView(await saveNickname(transport, nickname));
  }, [transport]);

  return { view, failed, save };
}
