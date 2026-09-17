import { useEffect, useRef, useState } from "react";
import type { Pose } from "../game/match/types";
import { MatchView, type HudState } from "../game/render/MatchView";
import type { MatchClient } from "../net/matchClient";
import { GripTuner, tunerEnabled } from "./GripTuner";
import { Hud } from "./Hud";

export interface MatchScreenProps {
  client: MatchClient;
  onFrame?: (dt: number, pose: Pose | null) => void;
  onExit: () => void;
}

const REASON_LABEL = {
  escaped: "살아남은 모험가가 모두 탈출했습니다",
  wiped: "모험가가 모두 쓰러졌습니다",
} as const;

export function MatchScreen({ client, onFrame, onExit }: MatchScreenProps) {
  const host = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const view = new MatchView(host.current!, client, {
      onFrame,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    let cancelled = false;
    const offHud = view.onHud((next) => {
      if (cancelled) return;
      setHud(next);
      setNow(performance.now());
    });
    view
      .start()
      .then(() => !cancelled && setReady(true))
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)));
    if (import.meta.env.DEV) (window as unknown as { __game?: unknown }).__game = view.debugHandle();
    return () => {
      cancelled = true;
      offHud();
      view.dispose();
    };
  }, [client, onFrame]);

  const result = hud?.result ?? null;
  useEffect(() => {
    if (result && document.pointerLockElement) document.exitPointerLock();
  }, [result]);

  const me = client.account;
  const mine = hud?.results?.find((r) => r.account === me) ?? null;
  const waiting = hud && (hud.phase === "searching" || hud.phase === "lobby");

  return (
    <div className="app" ref={host}>
      {ready && hud && !result && <Hud hud={hud} now={now} />}
      {ready && tunerEnabled() && <GripTuner />}
      {!ready && !loadError && <div className="overlay">불러오는 중 {progress.done}/{progress.total}</div>}
      {loadError && <div className="overlay error">불러오기 실패: {loadError}</div>}
      {ready && waiting && <div className="overlay dim">플레이어를 기다리는 중 {hud.players}/4</div>}
      {ready && hud?.phase === "error" && (
        <div className="overlay dim error">
          <p>연결 오류: {client.state.error}</p>
          <button type="button" onClick={onExit}>처음으로</button>
        </div>
      )}
      {result && (
        <div className="overlay dim result">
          <h2>{result.winner === "traitor" ? "배신자 승리" : "모험가 승리"}</h2>
          <p>{REASON_LABEL[result.reason]}</p>
          {mine && <p>당신은 {mine.role === "traitor" ? "배신자" : "모험가"} — {mine.won ? "승리" : "패배"}</p>}
          <p>배신자: {result.traitor === me ? "당신" : result.traitor}</p>
          <button type="button" onClick={onExit}>처음으로</button>
        </div>
      )}
    </div>
  );
}
