import type { HudState } from "../game/render/MatchView";

const ROLE_LABEL = { adventurer: "모험가", traitor: "배신자" } as const;

const ERROR_LABEL: Record<string, string> = {
  not_ready: "아직 빙의할 수 없어요",
  out_of_range: "너무 멀어요",
  no_monster: "가까이에 빙의할 몬스터가 없어요",
  not_at_exit: "탈출구 위에 서야 해요",
  too_fast: "조금 천천히",
  not_authority: "조종할 수 없는 몬스터예요",
  stunned: "몬스터가 기절했어요",
  monster_dead: "이미 쓰러진 몬스터예요",
  no_target: "대상이 없어요",
  unavailable: "지금은 할 수 없어요",
  not_playing: "경기 중이 아니에요",
  already_possessing: "이미 빙의 중이에요",
  not_possessing: "빙의 중이 아니에요",
  not_traitor: "배신자만 할 수 있어요",
  match_full: "방이 가득 찼어요",
};

const PAIN_SHOW_MS = 1500;
const ERROR_SHOW_MS = 2000;

function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function possessionText(hud: HudState): string {
  if (hud.possession) return `빙의 중 ${clock(hud.possession.remainingMs)} · 클릭 공격 · R 해제`;
  if (hud.possessReadyInMs !== null && hud.possessReadyInMs > 0) return `빙의 준비 중 ${clock(hud.possessReadyInMs)}`;
  if (hud.canPossess) return "E: 가까운 몬스터에 빙의";
  return "빙의 가능 — 몬스터 12m 안으로 가세요";
}

export function Hud({ hud, now }: { hud: HudState; now: number }) {
  const pain = hud.painAt !== null && now - hud.painAt < PAIN_SHOW_MS;
  const error = hud.error && now - hud.error.at < ERROR_SHOW_MS ? (ERROR_LABEL[hud.error.code] ?? null) : null;
  const inside = hud.alive && !hud.escaped;
  return (
    <>
      <div className="hud-top">
        {hud.role && <span className={`role role-${hud.role}`}>{ROLE_LABEL[hud.role]}</span>}
        {hud.hp !== null && <span className="hp">체력 {hud.hp}</span>}
        {hud.timeLeftMs !== null && <span className="timer">{clock(hud.timeLeftMs)}</span>}
      </div>
      {hud.role === "traitor" && inside && <div className="hud-possess">{possessionText(hud)}</div>}
      {hud.nearExit && <div className="hud-prompt">F: 탈출</div>}
      {!hud.alive && <div className="hud-prompt">쓰러졌습니다 — 결과를 기다리는 중</div>}
      {hud.escaped && <div className="hud-prompt">탈출했습니다 — 결과를 기다리는 중</div>}
      {pain && <div className="pain">가까이서 비명이 들렸다!</div>}
      {error && <div className="hud-error">{error}</div>}
      {inside && !hud.possession && <div className="crosshair" />}
      <div className="hint">클릭해서 조작 · WASD 이동 · 클릭 사격 · F 탈출{hud.role === "traitor" ? " · E 빙의 · R 해제" : ""}</div>
    </>
  );
}
