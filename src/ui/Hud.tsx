import type { HudState, ObjectiveHud, VoteHud } from "../game/render/MatchView";

const ROLE_LABEL = { adventurer: "모험가", traitor: "배신자" } as const;

const ERROR_LABEL: Record<string, string> = {
  not_ready: "아직 빙의할 수 없어요",
  out_of_range: "너무 멀어요",
  no_monster: "가까이에 빙의할 몬스터가 없어요",
  not_at_exit: "출구 위에 서야 해요",
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
  nothing_here: "여기엔 쓸 수 있는 게 없어요",
  need_shards: "열쇠 2개가 모두 있어야 해요",
  exit_locked: "아직 출구가 봉인돼 있어요",
  sealed: "정체가 드러나 빙의가 봉인됐어요",
  bound: "묶여 있어서 할 수 없어요",
};

const PAIN_SHOW_MS = 1500;
const ERROR_SHOW_MS = 2000;
const VOTE_BANNER_MS = 6000;

function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function seconds(ms: number): number {
  return Math.ceil(ms / 1000);
}

function objectiveText(o: ObjectiveHud): string {
  switch (o.stage) {
    case "shards":
      return o.shards < o.shardTotal ? `열쇠 찾기 ${o.shards}/${o.shardTotal}` : "철문으로 가서 열쇠로 열기";
    case "devices":
      return `의식 촛대 ${o.devicesOn}/${o.deviceTotal} 켜짐 — 둘을 동시에 켜야 문이 열린다`;
    case "seal":
      if (!o.sealStarted) return "제단에서 봉인 해제 시작";
      return `봉인 해제 ${seconds(o.sealMs)}/${seconds(o.sealTotalMs)}초${o.guarded ? "" : " — 제단 곁을 지키세요!"}`;
    case "boss":
      return o.bossHp === null ? "보스 처치" : `보스 처치 — 체력 ${o.bossHp}/${o.bossMaxHp}`;
    case "exit":
      return "출구로 탈출 (F)";
  }
}

function VotePanel({ vote }: { vote: VoteHud }) {
  const deciding = vote.leading !== null && vote.decideInMs !== null;
  return (
    <div className="hud-vote">
      <div className="hud-vote-title">
        투표! {seconds(vote.remainingMs)}초 안에 발판에 서세요 · 과반 {vote.needed}명이면 바로 결정
      </div>
      <div className="hud-vote-plates">
        {vote.plates.map((p, i) => (
          <span key={i} className={`plate${p.skip ? " skip" : ""}${vote.mine === i ? " mine" : ""}${vote.leading === i ? " leading" : ""}`}>
            {p.name} {p.votes}
          </span>
        ))}
      </div>
      {deciding && <div className="hud-vote-deciding">{vote.plates[vote.leading!].name} 결정까지 {seconds(vote.decideInMs!)}초</div>}
    </div>
  );
}

function voteResultText(name: string | null, guilty: boolean): string {
  if (name === null) return "투표 결과: 아무도 지목되지 않았다";
  return guilty ? `${name}은(는) 배신자였다! 빙의가 봉인됐다` : `${name}은(는) 무고했다 — 20초 동안 묶인다`;
}

function possessionText(hud: HudState): string {
  if (hud.sealed) return "정체가 드러나 빙의가 봉인됐다";
  if (hud.possession) return `빙의 중 ${clock(hud.possession.remainingMs)} · 클릭 공격 · R 해제`;
  if (hud.possessReadyInMs !== null && hud.possessReadyInMs > 0) return `빙의 준비 중 ${clock(hud.possessReadyInMs)}`;
  if (hud.canPossess) return "Q: 가까운 몬스터에 빙의";
  return "빙의 가능 — 몬스터 12m 안으로 가세요";
}

export function Hud({ hud, now }: { hud: HudState; now: number }) {
  const pain = hud.painAt !== null && now - hud.painAt < PAIN_SHOW_MS;
  const error = hud.error && now - hud.error.at < ERROR_SHOW_MS ? (ERROR_LABEL[hud.error.code] ?? null) : null;
  const inside = hud.alive && !hud.escaped;
  const vote = hud.lastVote && hud.lastVote.ageMs < VOTE_BANNER_MS ? hud.lastVote : null;
  return (
    <>
      <div className="hud-top">
        {hud.role && <span className={`role role-${hud.role}`}>{ROLE_LABEL[hud.role]}</span>}
        {hud.hp !== null && <span className="hp">체력 {hud.hp}</span>}
        {hud.elapsedMs !== null && <span className="timer">{clock(hud.elapsedMs)}</span>}
      </div>
      {hud.objective && <div className="hud-objective">{objectiveText(hud.objective)}</div>}
      {hud.revealed && <div className="hud-revealed">배신자: {hud.revealed}</div>}
      {hud.role === "traitor" && inside && <div className="hud-possess">{possessionText(hud)}</div>}
      {inside && hud.interactHint && <div className="hud-prompt">{hud.interactHint}</div>}
      {hud.nearExit && <div className="hud-prompt low">F: 탈출</div>}
      {hud.vote && <VotePanel vote={hud.vote} />}
      {vote && (
        <div className={`hud-banner ${vote.guilty ? "guilty" : "innocent"}`}>{voteResultText(vote.name, vote.guilty)}</div>
      )}
      {hud.boundMs !== null && <div className="hud-bound">묶여 있음 {seconds(hud.boundMs)}초</div>}
      {!hud.alive && <div className="hud-prompt">쓰러졌습니다 — 결과를 기다리는 중</div>}
      {hud.escaped && <div className="hud-prompt">탈출했습니다 — 결과를 기다리는 중</div>}
      {pain && <div className="pain">가까이서 비명이 들렸다!</div>}
      {error && <div className="hud-error">{error}</div>}
      {inside && !hud.possession && <div className="crosshair" />}
      <div className="hint">
        클릭해서 조작 · WASD 이동 · 클릭 사격 · E 상호작용 · F 탈출{hud.role === "traitor" ? " · Q 빙의 · R 해제" : ""} · 투표 때 발판에 서서 배신자 지목
      </div>
    </>
  );
}
