import { useEffect, useRef, useState } from "react";
import { GameView } from "./game/render/GameView";

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const view = new GameView(host.current!);
    let cancelled = false;
    view
      .start({ onProgress: (done, total) => !cancelled && setProgress({ done, total }) })
      .then(() => !cancelled && setReady(true))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    if (import.meta.env.DEV) (window as unknown as { __game?: unknown }).__game = view.debugHandle();
    return () => {
      cancelled = true;
      view.dispose();
    };
  }, []);

  return (
    <div className="app" ref={host}>
      <div className="hud">DUNGEON EYE</div>
      {ready && <div className="crosshair" />}
      {ready && <div className="hint">클릭해서 조작 · WASD 이동 · 마우스 조준</div>}
      {!ready && !error && (
        <div className="overlay">불러오는 중 {progress.done}/{progress.total}</div>
      )}
      {error && <div className="overlay error">불러오기 실패: {error}</div>}
    </div>
  );
}
