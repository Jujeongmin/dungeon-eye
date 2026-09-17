# Traitor Hunt — Plan 2: Server Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4인 매치의 모든 규칙(방 찾기, 배신자 배정, 빙의, 연결 대미지, 사격·몬스터 공격, 탈출, 승패)을 Verse8 서버에서 판정하고, 판이 끝나면 각자의 결과를 영구 기록(전적 기록 + 누적 프로필)한다. 가짜 계정 4명으로 한 판이 끝까지 돌아가는 것을 테스트로 증명한다. 화면(클라이언트) 연결은 Plan 3.

## 전체 로드맵 (2026-09-17 갱신)

한 판으로 끝나지 않는 게임을 위해 장기 성장 3종(계정 레벨·해금, 미션·업적, 랭킹·시즌)을 넣기로 했다. 세 기능은 모두 이 계획이 남기는 **판 결과 기록**을 읽어 계산한다.

| 계획 | 내용 |
|---|---|
| Plan 1 (완료) | 스캐폴딩, 에셋 파이프라인, 싱글 FPS 이동·사격 |
| **Plan 2 (이 문서)** | 서버 매치 규칙 + 판 기록·정산(전적 기록, 누적 프로필) |
| Plan 3 | 멀티플레이 화면 연결, 빙의 시점 전환, 본체 실신·비명 연출, 1인칭 손 모델 |
| Plan 4 | 계정 레벨·해금 + 미션·업적 (각각 수치·목록은 그 계획 전에 따로 설계) |
| Plan 5 | 랭킹·시즌 |
| Plan 6 | 로비·결과 화면, 모바일 조작, 성능 점검, Verse8 배포 |

**Architecture:** 규칙은 Verse8·Three·React를 모르는 순수 TypeScript(`src/game/match/`)로 쓰고 vitest로 촘촘히 검증한다. 서버(`server/src/server.ts`)는 Agent8 공식 도구 `@agent8/gameserver-node`로 만들며, 요청마다 방 잠금 → 상태 읽기 → 규칙 함수 호출 → 결과 저장 → 메시지 발송만 한다. 서버 통합 테스트는 같은 도구의 로컬 테스트 러너로 돌린다.

**Tech Stack:** TypeScript, vitest 3, `@agent8/gameserver-node` 0.1.13 (esbuild 번들, isolated-vm 흉내 런타임), `@agent8/gameserver` 1.10.2.

## 확정된 결정 (2026-09-17)

| 항목 | 결정 |
|---|---|
| 정체 숨기기 | 단순 방식. 비밀 정보(배신자, 체력, 빙의 상태)는 매치마다 이름이 무작위인 전역 컬렉션에 둔다. 클라이언트가 읽을 수는 있으므로 **완전한 비밀은 아님**(사용자 동의). 각자의 역할·체력은 서버 함수 응답과 개인 메시지로만 보낸다. |
| 모험가 승리 | 배신자를 뺀 **살아 있는 모험가 전원**이 탈출구에 도달. 모험가가 모두 죽거나(탈출자 0) 시간이 끝나면 배신자 승. 살아 있는 모험가가 0명이 됐을 때 탈출자가 1명 이상이면 모험가 승. |
| 체력 | 모두 100 |
| 한 판 시간 | 8분 (기획서에 없던 값, 플레이테스트로 조정) |
| 빙의 | 첫 빙의는 시작 60초 후부터, 지속 8초, 끝난 뒤 45초 쿨다운, 거리 12m 이내 몬스터만 |
| 연결 대미지 | 빙의 몬스터가 받은 피해의 40% (반올림)를 본체에. 빙의 중 몬스터가 죽으면 본체에 추가 35 |
| 비명(pain) | 본체 기준 반경 10m 안의 다른 플레이어에게만 전송 |
| 본체 피격 | 빙의 중 본체가 총에 맞으면 빙의 즉시 해제, 그 몬스터 2초 기절 |
| 아군 사격 | 허용 (의심 가는 본체를 쏘는 것이 핵심 대응 수단) |
| 몬스터 조종 권한 | 빙의 중인 몬스터는 배신자, 나머지는 방의 첫 번째 활동 플레이어(호스트)가 위치를 보고하고 공격을 신청 |

## 참고 게임(Maple Tower Defense)에서 가져온 설계

공개된 클라이언트 코드에서 확인한 패턴만 가져온다(서버 코드는 볼 수 없음).
- 서버가 방을 골라 입장까지 시키는 `findMatch` 전역 함수
- 재접속·동기화용 상태 조회 함수(`getMatchState`)
- 잦은 보고는 응답 없는(`needResponse: false`) 호출 + throttle
- "클라이언트가 보고(report*) → 서버가 검증" 구조
- `getServerVersion`으로 클라이언트·서버 버전 확인
- 최신 SDK는 `joinRoom`/`leaveRoom`을 예약어로 막으므로 **서버 함수 이름으로 쓰지 않는다**

## Global Constraints

- 규칙 모듈 `src/game/match/`와 `src/game/rules/`는 `three`, `react`, DOM, `$global`/`$room`/`$sender`를 import·참조하지 않는다. 시간은 인자 `now`(ms)로만 받는다.
- 서버 코드는 isolated-vm에서 돈다: Node 내장 모듈(`fs`, `crypto` 등)·네트워크·`setTimeout` 금지.
- 서버 함수 이름으로 `joinRoom`, `leaveRoom` 금지.
- 방 상태는 키 하나(`match`)에 통째로 저장한다(부분 병합 동작에 기대지 않음).
- 잠금 키는 `de-room-<roomId>`, `de-matchmaking`. 256자 이하, `{`, `}` 금지.
- 로컬 테스트 도구에는 `$roomTick`이 없다. 시간이 지나 생기는 변화(빙의 만료, 시간 종료)는 모든 요청에서 먼저 계산하고, `$roomTick`과 클라이언트 주기 호출(`syncMatch`)은 같은 계산을 부르기만 한다.
- 테스트용 시계 조작(`devAdvanceClock`)은 계정이 `test-`로 시작할 때만 허용한다(실서비스 계정은 `0x…` 주소).
- 기존 테스트(vitest 30개)는 계속 통과해야 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
src/game/rules/levelLayout.ts     (수정) 탈출구 E 기호, exits 목록
src/game/match/
  constants.ts                    규칙 수치
  types.ts                        상태·이벤트·오류 타입
  lifecycle.ts                    로비, 시작(배신자 배정), 판 기록 초기값
  possession.ts                   빙의 시작·해제·만료
  damage.ts                       사격, 몬스터 공격, 연결 대미지, 탈출, 몬스터 위치 보고
  outcome.ts                      이탈 처리, 승패 판정, 판 결과(PlayerResult) 만들기
  profile.ts                      누적 프로필(전적 합계) 갱신
  view.ts                         개인 화면용 정보, 주변 플레이어 찾기, 거리
tests/levelLayout.test.ts         (수정)
tests/match/lifecycle.test.ts
tests/match/view.test.ts
tests/match/possession.test.ts
tests/match/damage.test.ts
tests/match/outcome.test.ts
tests/match/profile.test.ts
server/
  package.json, tsconfig.json, .gitignore
  src/server.ts                   서버 함수 (Verse8에 배포되는 것)
  src/store.ts                    방 상태·비밀 컬렉션·전적 저장, 잠금
  test/test-globals.d.ts
  test/helpers.ts                 4계정 채우기, 배신자 찾기, 메시지 가로채기 등
  test/match.test.ts              방 찾기·상태·이탈·종료·정산 통합 테스트
  test/actions.test.ts            빙의·사격·몬스터·탈출 통합 테스트
package.json                      (수정) server:* 스크립트

영구 저장 위치 (Verse8 문서 1MB·인덱스 한도 때문에 개수가 늘어나는 기록은 컬렉션에 둔다):
- 판 결과 1건 = 전역 컬렉션 `match_results`의 문서 1개 (`PlayerResult` + `matchId`)
- 누적 전적 = 각 계정의 전역 사용자 상태 키 `profile` (숫자 몇 개라 크기 고정)
```

---

### Task 1: 탈출구를 지도에 추가

**Files:**
- Modify: `src/game/rules/levelLayout.ts`
- Modify: `tests/levelLayout.test.ts`

**Interfaces:**
- Produces: `LevelLayout.exits: Point2[]` — 기호 `E` 칸의 중심. `E`는 걸을 수 있는 바닥 칸이다(바닥·천장·벽 배치는 `.`과 같음).
  `LEVEL_1`의 6행 9열(`x: 38, z: 26`)이 탈출구가 된다.

- [ ] **Step 1: 실패하는 테스트 추가** — `tests/levelLayout.test.ts`의 `describe("parseLevel", ...)` 블록 안 끝에 추가:

```ts
  it("records exits as walkable floor cells", () => {
    const withExit = parseLevel(["####", "#PE#", "####"], 2);
    expect(withExit.exits).toEqual([{ x: 5, z: 3 }]);
    expect(withExit.solid[1][2]).toBe(false);
    expect(withExit.placements).toContainEqual({ model: "dd_floor_a", x: 5, y: 0, z: 3, rotationY: 0 });
  });
```

같은 파일의 `describe("LEVEL_1", ...)` 안에 추가:

```ts
  it("has exactly one exit, on a walkable cell", () => {
    const level = parseLevel(LEVEL_1, 4);
    expect(level.exits).toEqual([{ x: 38, z: 26 }]);
    expect(solidAt(level, 38, 26)).toBe(false);
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/levelLayout.test.ts`
Expected: FAIL — `unknown symbol "E"`, `exits`가 `undefined`.

- [ ] **Step 3: 구현** — `src/game/rules/levelLayout.ts`

`LevelLayout`에 필드 추가(`zombieSpawns` 아래):
```ts
  exits: Point2[];
```

`LEVEL_1`의 인덱스 6 줄을 교체:
```ts
  "#..Z.....E#",
```

`FLOOR_SYMBOLS` 교체:
```ts
const FLOOR_SYMBOLS = new Set([".", "P", "Z", "B", "C", "E"]);
```

`parseLevel` 안 `const zombieSpawns: Point2[] = [];` 아래에 추가:
```ts
  const exits: Point2[] = [];
```

`if (ch === "Z") zombieSpawns.push({ x, z });` 아래에 추가:
```ts
      if (ch === "E") exits.push({ x, z });
```

반환문 교체:
```ts
  return { tileSize, cols, rows: rows.length, solid, placements, playerSpawn, zombieSpawns, exits };
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: 전체 PASS (32 tests), 타입 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/game/rules/levelLayout.ts tests/levelLayout.test.ts
git commit -m "feat: exit cells in the dungeon grid"
```

---

### Task 2: 매치 타입·수치 + 로비와 시작(배신자 배정)

**Files:**
- Create: `src/game/match/constants.ts`
- Create: `src/game/match/types.ts`
- Create: `src/game/match/lifecycle.ts` (이 태스크에서는 로비·시작·활동 판정까지)
- Test: `tests/match/lifecycle.test.ts`

**Interfaces:**
- Produces: `constants.ts`, `types.ts` 전체(아래 코드 그대로), 그리고 `lifecycle.ts`의
  ```ts
  export function createLobby(now: number): PublicMatch
  export function joinLobby(match: PublicMatch, account: string): void       // 이미 있으면 아무것도 안 함
  export function leaveLobby(match: PublicMatch, account: string): void
  export function startMatch(match: PublicMatch, now: number, rng: () => number, spawns: MonsterSpawn[]): SecretMatch
  export function isActive(match: PublicMatch, account: string): boolean
  export function monsterSpawnsFor(layout: { zombieSpawns: Vec2[] }): MonsterSpawn[]   // id "zombie-<i>"
  export function emptyStats(): PlayerStats
  ```
- 규칙: 모든 규칙 함수는 넘겨받은 `match`/`secret`을 **직접 수정**하고, 위반은 `RuleViolation`(메시지 = 오류 코드)을 던진다.

- [ ] **Step 1: 수치** — `src/game/match/constants.ts`

```ts
export const PROTOCOL_VERSION = 1;
export const MATCH_PLAYERS = 4;
export const MATCH_DURATION_MS = 8 * 60_000;
export const PLAYER_HP = 100;

export const POSSESS_FIRST_READY_MS = 60_000;
export const POSSESS_DURATION_MS = 8_000;
export const POSSESS_COOLDOWN_MS = 45_000;
export const POSSESS_RANGE = 12;
export const LINK_DAMAGE_RATIO = 0.4;
export const MONSTER_DEATH_BODY_DAMAGE = 35;
export const PAIN_RADIUS = 10;
export const BODY_HIT_STUN_MS = 2_000;

export const ZOMBIE_HP = 100;
export const ZOMBIE_ATTACK_DAMAGE = 20;
export const ZOMBIE_ATTACK_RANGE = 1.8;
export const ZOMBIE_ATTACK_INTERVAL_MS = 1_200;

export const AKM_DAMAGE = 34;
export const AKM_FIRE_INTERVAL_MS = 100;
export const AKM_RANGE = 60;

// Positions arrive throttled from clients, so range checks allow for lag.
export const RANGE_SLACK = 1.5;
export const EXIT_RADIUS = 2;
```

- [ ] **Step 2: 타입** — `src/game/match/types.ts`

```ts
export type Phase = "lobby" | "playing" | "ended";
export type Winner = "adventurers" | "traitor";
export type EndReason = "escaped" | "wiped" | "timeout";

export interface Vec2 { x: number; z: number }
export interface Pose extends Vec2 { yaw: number }
export type Poses = Record<string, Pose | null>;

export interface MonsterState {
  kind: "zombie";
  x: number;
  z: number;
  yaw: number;
  hp: number;
  alive: boolean;
  possessed: boolean;
  stunnedUntil: number;
  attackReadyAt: number;
}

export interface SecretRef { collection: string; id: string }
export interface MatchResult { winner: Winner; reason: EndReason; traitor: string }

export interface PublicMatch {
  version: 1;
  phase: Phase;
  players: string[];
  createdAt: number;
  startedAt: number | null;
  endsAt: number | null;
  endedAt: number | null;
  monsters: Record<string, MonsterState>;
  dead: string[];
  escaped: string[];
  result: MatchResult | null;
  // Filled by the server when the match ends; the traitor is public by then.
  results: PlayerResult[] | null;
  secretRef: SecretRef | null;
  devClockOffsetMs: number;
}

export interface Possession { monsterId: string; endsAt: number }

// Per-player counters for one match. Kept secret: traitor-side numbers would reveal the traitor.
export interface PlayerStats {
  monsterKills: number;
  monsterDamage: number;
  playerDamage: number;
  traitorDamage: number;
  possessions: number;
  possessedDamage: number;
}

export interface SecretMatch {
  traitor: string;
  hp: Record<string, number>;
  possession: Possession | null;
  readyAt: number;
  lastShotAt: Record<string, number>;
  stats: Record<string, PlayerStats>;
}

export interface PlayerResult {
  account: string;
  role: "adventurer" | "traitor";
  won: boolean;
  escaped: boolean;
  died: boolean;
  reason: EndReason;
  durationMs: number;
  endedAt: number;
  stats: PlayerStats;
}

export type MatchEvent =
  | { type: "private"; account: string }
  | { type: "pain"; x: number; z: number; to: string[] }
  | { type: "possession"; monsterId: string; active: boolean; endsAt: number | null }
  | { type: "ended" };

export type RuleError =
  | "not_playing" | "not_traitor" | "not_ready" | "already_possessing" | "not_possessing"
  | "unavailable" | "no_monster" | "monster_dead" | "out_of_range" | "too_fast"
  | "not_authority" | "stunned" | "no_target" | "not_at_exit" | "match_full";

export class RuleViolation extends Error {
  readonly code: RuleError;
  constructor(code: RuleError) {
    super(code);
    this.code = code;
    this.name = "RuleViolation";
  }
}

export interface MonsterSpawn { id: string; x: number; z: number }
```


- [ ] **Step 3: 실패하는 테스트** — `tests/match/lifecycle.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  MATCH_DURATION_MS, MATCH_PLAYERS, PLAYER_HP, POSSESS_FIRST_READY_MS, ZOMBIE_HP,
} from "../../src/game/match/constants";
import {
  createLobby, emptyStats, isActive, joinLobby, leaveLobby, monsterSpawnsFor, startMatch,
} from "../../src/game/match/lifecycle";
import { RuleViolation } from "../../src/game/match/types";

const ACCOUNTS = ["a", "b", "c", "d"];
const SPAWNS = [{ id: "zombie-0", x: 1, z: 2 }];

function fullLobby() {
  const match = createLobby(1000);
  for (const a of ACCOUNTS) joinLobby(match, a);
  return match;
}

describe("lobby", () => {
  it("starts empty in the lobby phase", () => {
    const match = createLobby(1000);
    expect(match).toMatchObject({ version: 1, phase: "lobby", players: [], createdAt: 1000, result: null, secretRef: null });
  });

  it("adds players once, in join order, up to the limit", () => {
    const match = fullLobby();
    joinLobby(match, "b");
    expect(match.players).toEqual(ACCOUNTS);
    expect(() => joinLobby(match, "e")).toThrow(RuleViolation);
    expect(() => joinLobby(match, "e")).toThrow("match_full");
    expect(MATCH_PLAYERS).toBe(4);
  });

  it("removes a player who leaves the lobby", () => {
    const match = fullLobby();
    leaveLobby(match, "c");
    expect(match.players).toEqual(["a", "b", "d"]);
  });

  it("refuses to join a match that already started", () => {
    const match = fullLobby();
    startMatch(match, 5000, () => 0, SPAWNS);
    expect(() => joinLobby(match, "e")).toThrow("unavailable");
  });
});

describe("startMatch", () => {
  it("needs a full lobby", () => {
    const match = createLobby(1000);
    joinLobby(match, "a");
    expect(() => startMatch(match, 5000, () => 0, SPAWNS)).toThrow("not_playing");
  });

  it("picks the traitor from the rng and sets the clock", () => {
    const match = fullLobby();
    const secret = startMatch(match, 5000, () => 0.6, SPAWNS);
    expect(secret.traitor).toBe("c");
    expect(match.phase).toBe("playing");
    expect(match.startedAt).toBe(5000);
    expect(match.endsAt).toBe(5000 + MATCH_DURATION_MS);
    expect(secret.readyAt).toBe(5000 + POSSESS_FIRST_READY_MS);
    expect(secret.possession).toBeNull();
    expect(secret.hp).toEqual({ a: PLAYER_HP, b: PLAYER_HP, c: PLAYER_HP, d: PLAYER_HP });
    expect(Object.keys(secret.stats)).toEqual(ACCOUNTS);
    expect(secret.stats.a).toEqual(emptyStats());
    expect(Object.values(emptyStats()).every((v) => v === 0)).toBe(true);
  });

  it("never picks out of range, even for rng() close to 1", () => {
    const match = fullLobby();
    expect(startMatch(match, 5000, () => 0.9999999, SPAWNS).traitor).toBe("d");
  });

  it("places monsters from the spawns at full health", () => {
    const match = fullLobby();
    startMatch(match, 5000, () => 0, SPAWNS);
    expect(match.monsters["zombie-0"]).toEqual({
      kind: "zombie", x: 1, z: 2, yaw: 0, hp: ZOMBIE_HP, alive: true, possessed: false, stunnedUntil: 0, attackReadyAt: 0,
    });
  });

  it("does not put the traitor anywhere in the public match", () => {
    const match = fullLobby();
    startMatch(match, 5000, () => 0.3, SPAWNS);
    expect(JSON.stringify(match)).not.toContain("traitor");
  });
});

describe("isActive / monsterSpawnsFor", () => {
  it("is true only for players who are neither dead nor escaped", () => {
    const match = fullLobby();
    match.dead.push("a");
    match.escaped.push("b");
    expect(ACCOUNTS.map((a) => isActive(match, a))).toEqual([false, false, true, true]);
    expect(isActive(match, "stranger")).toBe(false);
  });

  it("names zombie spawns by index", () => {
    expect(monsterSpawnsFor({ zombieSpawns: [{ x: 1, z: 2 }, { x: 3, z: 4 }] })).toEqual([
      { id: "zombie-0", x: 1, z: 2 },
      { id: "zombie-1", x: 3, z: 4 },
    ]);
  });
});
```

- [ ] **Step 4: 실패 확인**

Run: `npx vitest run tests/match/lifecycle.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/game/match/lifecycle"`

- [ ] **Step 5: 구현** — `src/game/match/lifecycle.ts`

```ts
import {
  MATCH_DURATION_MS, MATCH_PLAYERS, PLAYER_HP, POSSESS_FIRST_READY_MS, ZOMBIE_HP,
} from "./constants";
import {
  RuleViolation, type MonsterSpawn, type PlayerStats, type PublicMatch, type SecretMatch, type Vec2,
} from "./types";

export function createLobby(now: number): PublicMatch {
  return {
    version: 1,
    phase: "lobby",
    players: [],
    createdAt: now,
    startedAt: null,
    endsAt: null,
    endedAt: null,
    monsters: {},
    dead: [],
    escaped: [],
    result: null,
    results: null,
    secretRef: null,
    devClockOffsetMs: 0,
  };
}

export function joinLobby(match: PublicMatch, account: string): void {
  if (match.players.includes(account)) return;
  if (match.phase !== "lobby") throw new RuleViolation("unavailable");
  if (match.players.length >= MATCH_PLAYERS) throw new RuleViolation("match_full");
  match.players.push(account);
}

export function leaveLobby(match: PublicMatch, account: string): void {
  if (match.phase !== "lobby") throw new RuleViolation("unavailable");
  match.players = match.players.filter((p) => p !== account);
}

export function startMatch(match: PublicMatch, now: number, rng: () => number, spawns: MonsterSpawn[]): SecretMatch {
  if (match.phase !== "lobby" || match.players.length !== MATCH_PLAYERS) throw new RuleViolation("not_playing");
  const index = Math.min(match.players.length - 1, Math.floor(rng() * match.players.length));

  match.phase = "playing";
  match.startedAt = now;
  match.endsAt = now + MATCH_DURATION_MS;
  match.monsters = {};
  for (const spawn of spawns) {
    match.monsters[spawn.id] = {
      kind: "zombie", x: spawn.x, z: spawn.z, yaw: 0, hp: ZOMBIE_HP,
      alive: true, possessed: false, stunnedUntil: 0, attackReadyAt: 0,
    };
  }

  const hp: Record<string, number> = {};
  const stats: Record<string, PlayerStats> = {};
  for (const p of match.players) {
    hp[p] = PLAYER_HP;
    stats[p] = emptyStats();
  }
  return {
    traitor: match.players[index], hp, possession: null,
    readyAt: now + POSSESS_FIRST_READY_MS, lastShotAt: {}, stats,
  };
}

export function emptyStats(): PlayerStats {
  return { monsterKills: 0, monsterDamage: 0, playerDamage: 0, traitorDamage: 0, possessions: 0, possessedDamage: 0 };
}

export function isActive(match: PublicMatch, account: string): boolean {
  return match.players.includes(account) && !match.dead.includes(account) && !match.escaped.includes(account);
}

export function monsterSpawnsFor(layout: { zombieSpawns: Vec2[] }): MonsterSpawn[] {
  return layout.zombieSpawns.map((s, i) => ({ id: `zombie-${i}`, x: s.x, z: s.z }));
}
```

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run tests/match/lifecycle.test.ts && npm run typecheck`
Expected: PASS (11 tests), 타입 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add src/game/match tests/match/lifecycle.test.ts
git commit -m "feat: match lobby and hidden traitor assignment rules"
```

---

### Task 3: 빙의 규칙 + 개인 정보·주변 판정

**Files:**
- Create: `src/game/match/view.ts`
- Create: `src/game/match/possession.ts`
- Test: `tests/match/view.test.ts`
- Test: `tests/match/possession.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `constants.ts`, `isActive`, `createLobby`, `joinLobby`, `startMatch` (Task 2)
- Produces (`view.ts`):
  ```ts
  export function distance(a: Vec2, b: Vec2): number
  export function nearbyAccounts(poses: Poses, point: Vec2, radius: number, exclude: string): string[]   // 정렬됨, 반경 포함
  export interface PrivateView { role: "adventurer" | "traitor" | null; hp: number | null; possession: Possession | null; possessReadyAt: number | null }
  export function privateView(match: PublicMatch, secret: SecretMatch | null, account: string): PrivateView
  ```
- Produces (`possession.ts`):
  ```ts
  export function endPossession(match: PublicMatch, secret: SecretMatch, endedAt: number): MatchEvent[]
  export function expirePossession(match: PublicMatch, secret: SecretMatch, now: number): MatchEvent[]
  export function startPossession(match: PublicMatch, secret: SecretMatch, account: string, monsterId: string, bodyPose: Vec2 | null, now: number): MatchEvent[]
  export function releasePossession(match: PublicMatch, secret: SecretMatch, account: string, now: number): MatchEvent[]
  ```
  쿨다운은 빙의가 **실제로 끝난 시각** 기준이다. 만료를 늦게 계산해도(`expirePossession`을 나중에 불러도) 쿨다운이 밀리지 않는다.

- [ ] **Step 1: 실패하는 테스트** — `tests/match/view.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { distance, nearbyAccounts, privateView } from "../../src/game/match/view";

function playing() {
  const match = createLobby(0);
  for (const a of ["a", "b", "c", "d"]) joinLobby(match, a);
  const secret = startMatch(match, 0, () => 0.6, []);
  return { match, secret };
}

describe("distance / nearbyAccounts", () => {
  it("measures on the ground plane", () => {
    expect(distance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });

  it("lists other accounts within the radius, sorted, skipping unknown poses", () => {
    const poses = {
      c: { x: 0, z: 0, yaw: 0 },
      b: { x: 0, z: 10, yaw: 0 },
      a: { x: 3, z: 4, yaw: 0 },
      d: null,
    };
    expect(nearbyAccounts(poses, { x: 0, z: 0 }, 10, "c")).toEqual(["a", "b"]);
    expect(nearbyAccounts(poses, { x: 0, z: 0 }, 9.9, "c")).toEqual(["a"]);
  });
});

describe("privateView", () => {
  it("tells the traitor their role, hp and possession timing", () => {
    const { match, secret } = playing();
    expect(privateView(match, secret, "c")).toEqual({ role: "traitor", hp: 100, possession: null, possessReadyAt: 60_000 });
  });

  it("tells an adventurer only their role and hp", () => {
    const { match, secret } = playing();
    secret.possession = { monsterId: "zombie-0", endsAt: 1 };
    expect(privateView(match, secret, "a")).toEqual({ role: "adventurer", hp: 100, possession: null, possessReadyAt: null });
  });

  it("tells a stranger, or anyone before the match starts, nothing", () => {
    const { match, secret } = playing();
    const empty = { role: null, hp: null, possession: null, possessReadyAt: null };
    expect(privateView(match, secret, "z")).toEqual(empty);
    expect(privateView(match, null, "a")).toEqual(empty);
  });
});
```

- [ ] **Step 2: 실패하는 테스트** — `tests/match/possession.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { POSSESS_COOLDOWN_MS, POSSESS_DURATION_MS, POSSESS_FIRST_READY_MS } from "../../src/game/match/constants";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import {
  endPossession, expirePossession, releasePossession, startPossession,
} from "../../src/game/match/possession";

const NEAR = { x: 5, z: 10 };
const READY = POSSESS_FIRST_READY_MS;

// Traitor is "c" (rng 0.6); one zombie at (10, 10); match starts at t=0.
function playing() {
  const match = createLobby(0);
  for (const a of ["a", "b", "c", "d"]) joinLobby(match, a);
  const secret = startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 10, z: 10 }]);
  return { match, secret };
}

describe("startPossession", () => {
  it("takes over a nearby monster once ready", () => {
    const { match, secret } = playing();
    const events = startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    const endsAt = READY + POSSESS_DURATION_MS;
    expect(events).toEqual([
      { type: "possession", monsterId: "zombie-0", active: true, endsAt },
      { type: "private", account: "c" },
    ]);
    expect(secret.possession).toEqual({ monsterId: "zombie-0", endsAt });
    expect(match.monsters["zombie-0"].possessed).toBe(true);
    expect(secret.stats.c.possessions).toBe(1);
  });

  it("refuses before the first ready time", () => {
    const { match, secret } = playing();
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY - 1)).toThrow("not_ready");
  });

  it("refuses anyone but the traitor", () => {
    const { match, secret } = playing();
    expect(() => startPossession(match, secret, "a", "zombie-0", NEAR, READY)).toThrow("not_traitor");
  });

  it("refuses a far monster or an unknown body position", () => {
    const { match, secret } = playing();
    expect(() => startPossession(match, secret, "c", "zombie-0", { x: 30, z: 10 }, READY)).toThrow("out_of_range");
    expect(() => startPossession(match, secret, "c", "zombie-0", null, READY)).toThrow("out_of_range");
  });

  it("refuses unknown or dead monsters", () => {
    const { match, secret } = playing();
    expect(() => startPossession(match, secret, "c", "zombie-9", NEAR, READY)).toThrow("no_monster");
    match.monsters["zombie-0"].alive = false;
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY)).toThrow("monster_dead");
  });

  it("refuses a dead traitor, a second possession, and a match not in play", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY + 1)).toThrow("already_possessing");
    match.dead.push("c");
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY + 1)).toThrow("unavailable");
    match.phase = "ended";
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY + 1)).toThrow("not_playing");
  });

  it("expires an old possession first, then allows the next one after the cooldown", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    const end = READY + POSSESS_DURATION_MS;
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, end + POSSESS_COOLDOWN_MS - 1)).toThrow("not_ready");
    const events = startPossession(match, secret, "c", "zombie-0", NEAR, end + POSSESS_COOLDOWN_MS);
    expect(events.map((e) => e.type)).toEqual(["possession", "private", "possession", "private"]);
    expect(events[0]).toEqual({ type: "possession", monsterId: "zombie-0", active: false, endsAt: null });
    expect(secret.possession?.endsAt).toBe(end + POSSESS_COOLDOWN_MS + POSSESS_DURATION_MS);
  });
});

describe("expirePossession / releasePossession / endPossession", () => {
  it("ends at endsAt and starts the cooldown from endsAt, however late it is noticed", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    const end = READY + POSSESS_DURATION_MS;
    expect(expirePossession(match, secret, end - 1)).toEqual([]);
    const events = expirePossession(match, secret, end + 30_000);
    expect(events).toEqual([
      { type: "possession", monsterId: "zombie-0", active: false, endsAt: null },
      { type: "private", account: "c" },
    ]);
    expect(secret.possession).toBeNull();
    expect(secret.readyAt).toBe(end + POSSESS_COOLDOWN_MS);
    expect(match.monsters["zombie-0"].possessed).toBe(false);
  });

  it("lets the traitor let go early", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    releasePossession(match, secret, "c", READY + 2000);
    expect(secret.possession).toBeNull();
    expect(secret.readyAt).toBe(READY + 2000 + POSSESS_COOLDOWN_MS);
  });

  it("refuses release when not possessing or not the traitor", () => {
    const { match, secret } = playing();
    expect(() => releasePossession(match, secret, "c", READY)).toThrow("not_possessing");
    expect(() => releasePossession(match, secret, "a", READY)).toThrow("not_traitor");
  });

  it("is a no-op when nothing is possessed", () => {
    const { match, secret } = playing();
    expect(endPossession(match, secret, READY)).toEqual([]);
    expect(secret.readyAt).toBe(READY);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/match/view.test.ts tests/match/possession.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/game/match/view"` / `.../possession"`

- [ ] **Step 4: 구현** — `src/game/match/view.ts`

```ts
import type { Poses, Possession, PublicMatch, SecretMatch, Vec2 } from "./types";

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function nearbyAccounts(poses: Poses, point: Vec2, radius: number, exclude: string): string[] {
  return Object.keys(poses)
    .filter((account) => {
      const pose = poses[account];
      return account !== exclude && pose !== null && pose !== undefined && distance(pose, point) <= radius;
    })
    .sort();
}

export interface PrivateView {
  role: "adventurer" | "traitor" | null;
  hp: number | null;
  possession: Possession | null;
  possessReadyAt: number | null;
}

export function privateView(match: PublicMatch, secret: SecretMatch | null, account: string): PrivateView {
  if (!secret || !match.players.includes(account)) return { role: null, hp: null, possession: null, possessReadyAt: null };
  const traitor = secret.traitor === account;
  return {
    role: traitor ? "traitor" : "adventurer",
    hp: secret.hp[account] ?? null,
    possession: traitor ? secret.possession : null,
    possessReadyAt: traitor ? secret.readyAt : null,
  };
}
```

- [ ] **Step 5: 구현** — `src/game/match/possession.ts`

```ts
import { POSSESS_COOLDOWN_MS, POSSESS_DURATION_MS, POSSESS_RANGE } from "./constants";
import { isActive } from "./lifecycle";
import { RuleViolation, type MatchEvent, type PublicMatch, type SecretMatch, type Vec2 } from "./types";
import { distance } from "./view";

export function endPossession(match: PublicMatch, secret: SecretMatch, endedAt: number): MatchEvent[] {
  const possession = secret.possession;
  if (!possession) return [];
  const monster = match.monsters[possession.monsterId];
  if (monster) monster.possessed = false;
  secret.possession = null;
  secret.readyAt = endedAt + POSSESS_COOLDOWN_MS;
  return [
    { type: "possession", monsterId: possession.monsterId, active: false, endsAt: null },
    { type: "private", account: secret.traitor },
  ];
}

export function expirePossession(match: PublicMatch, secret: SecretMatch, now: number): MatchEvent[] {
  const possession = secret.possession;
  if (!possession || now < possession.endsAt) return [];
  return endPossession(match, secret, possession.endsAt);
}

export function startPossession(
  match: PublicMatch, secret: SecretMatch, account: string, monsterId: string, bodyPose: Vec2 | null, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (account !== secret.traitor) throw new RuleViolation("not_traitor");
  if (!isActive(match, account)) throw new RuleViolation("unavailable");
  if (secret.possession) throw new RuleViolation("already_possessing");
  if (now < secret.readyAt) throw new RuleViolation("not_ready");
  const monster = match.monsters[monsterId];
  if (!monster) throw new RuleViolation("no_monster");
  if (!monster.alive) throw new RuleViolation("monster_dead");
  if (!bodyPose || distance(bodyPose, monster) > POSSESS_RANGE) throw new RuleViolation("out_of_range");

  const endsAt = now + POSSESS_DURATION_MS;
  secret.possession = { monsterId, endsAt };
  monster.possessed = true;
  secret.stats[account].possessions += 1;
  return [
    ...events,
    { type: "possession", monsterId, active: true, endsAt },
    { type: "private", account },
  ];
}

export function releasePossession(match: PublicMatch, secret: SecretMatch, account: string, now: number): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (account !== secret.traitor) throw new RuleViolation("not_traitor");
  if (!secret.possession) throw new RuleViolation("not_possessing");
  return [...events, ...endPossession(match, secret, now)];
}
```

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run tests/match && npm run typecheck`
Expected: PASS (lifecycle 11 + view 5 + possession 11 = 27 tests), 타입 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add src/game/match/view.ts src/game/match/possession.ts tests/match/view.test.ts tests/match/possession.test.ts
git commit -m "feat: possession rules with cooldown from the real end time"
```

---

### Task 4: 사격·몬스터 공격·연결 대미지·탈출

**Files:**
- Create: `src/game/match/damage.ts`
- Test: `tests/match/damage.test.ts`

**Interfaces:**
- Consumes: `isActive`, `emptyStats` 등(Task 2), `endPossession`, `expirePossession`(Task 3), `distance`, `nearbyAccounts`(Task 3)
- Produces:
  ```ts
  export interface MonsterPoseUpdate { id: string; x: number; z: number; yaw: number }
  export function monsterAuthority(match: PublicMatch, secret: SecretMatch, monsterId: string): string | null
  export function applyMonsterPoses(match: PublicMatch, secret: SecretMatch, caller: string, updates: MonsterPoseUpdate[], now: number): MatchEvent[]
  export function shootMonster(match: PublicMatch, secret: SecretMatch, shooter: string, monsterId: string, shooterPose: Pose | null, poses: Poses, now: number): MatchEvent[]
  export function shootPlayer(match: PublicMatch, secret: SecretMatch, shooter: string, target: string, shooterPose: Pose | null, targetPose: Pose | null, now: number): MatchEvent[]
  export function monsterAttack(match: PublicMatch, secret: SecretMatch, caller: string, monsterId: string, target: string, targetPose: Pose | null, now: number): MatchEvent[]
  export function reachExit(match: PublicMatch, secret: SecretMatch, account: string, pose: Pose | null, exits: Vec2[], now: number): MatchEvent[]
  ```
- 규칙 요약
  - 모든 행동은 먼저 `expirePossession`을 부른다(만료 이벤트가 결과 맨 앞에 온다).
  - 조종 권한: 빙의 중인 몬스터는 배신자, 그 외는 `players` 순서상 첫 번째 활동 플레이어(호스트). 권한이 없는 위치 보고는 조용히 무시한다.
  - 사격: 활동 중이어야 하고, 빙의 중인 배신자는 쏠 수 없다(본체가 멈춰 있음). 발사 간격 100ms, 사거리 60m(+1.5m 여유).
  - 빙의 몬스터 피격: 실제로 들어간 피해의 40%(반올림) + 그 발로 죽었으면 35를 본체에. 본체 위치가 알려져 있으면 반경 10m 안의 다른 플레이어에게 `pain` 이벤트.
  - 빙의 중 본체 피격: 빙의 해제 + 그 몬스터 2초 기절.
  - 체력이 0이 되면 `dead`에 추가. 배신자가 죽으면 빙의도 끝난다.
  - 기록: 몬스터에게 준 피해·처치, 플레이어에게 준 피해, 배신자 본체에 준 피해(연결 대미지 포함, 배신자 본인 제외), 빙의 몬스터로 준 피해.

- [ ] **Step 1: 실패하는 테스트** — `tests/match/damage.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  AKM_DAMAGE, BODY_HIT_STUN_MS, MONSTER_DEATH_BODY_DAMAGE, POSSESS_COOLDOWN_MS, POSSESS_DURATION_MS,
  ZOMBIE_ATTACK_DAMAGE, ZOMBIE_ATTACK_INTERVAL_MS,
} from "../../src/game/match/constants";
import {
  applyMonsterPoses, monsterAttack, monsterAuthority, reachExit, shootMonster, shootPlayer,
} from "../../src/game/match/damage";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { startPossession } from "../../src/game/match/possession";
import type { Pose, Poses } from "../../src/game/match/types";

const T = 100_000; // well after the first possession is ready
const at = (x: number, z: number): Pose => ({ x, z, yaw: 0 });

// Traitor is "c". zombie-0 at (10,10), zombie-1 at (50,10).
// a (0,10), b (8,10), c (5,10), d (40,10).
function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  const secret = startMatch(match, 0, () => 0.6, [
    { id: "zombie-0", x: 10, z: 10 },
    { id: "zombie-1", x: 50, z: 10 },
  ]);
  const poses: Poses = { a: at(0, 10), b: at(8, 10), c: at(5, 10), d: at(40, 10) };
  return { match, secret, poses };
}

function possessing() {
  const s = playing();
  startPossession(s.match, s.secret, "c", "zombie-0", s.poses.c, T);
  return s;
}

describe("monsterAuthority / applyMonsterPoses", () => {
  it("gives unpossessed monsters to the first active player and possessed ones to the traitor", () => {
    const { match, secret } = possessing();
    expect(monsterAuthority(match, secret, "zombie-1")).toBe("a");
    expect(monsterAuthority(match, secret, "zombie-0")).toBe("c");
    match.dead.push("a");
    expect(monsterAuthority(match, secret, "zombie-1")).toBe("b");
  });

  it("moves only monsters the caller controls, alive, with finite numbers", () => {
    const { match, secret } = possessing();
    match.monsters["zombie-1"].alive = true;
    applyMonsterPoses(match, secret, "a", [
      { id: "zombie-0", x: 1, z: 1, yaw: 1 },
      { id: "zombie-1", x: 45, z: 12, yaw: 2 },
      { id: "zombie-9", x: 0, z: 0, yaw: 0 },
    ], T + 1);
    expect(match.monsters["zombie-0"]).toMatchObject({ x: 10, z: 10 });
    expect(match.monsters["zombie-1"]).toMatchObject({ x: 45, z: 12, yaw: 2 });

    applyMonsterPoses(match, secret, "c", [{ id: "zombie-0", x: 11, z: Number.NaN, yaw: 0 }], T + 2);
    expect(match.monsters["zombie-0"]).toMatchObject({ x: 10, z: 10 });
    applyMonsterPoses(match, secret, "c", [{ id: "zombie-0", x: 11, z: 9, yaw: 0.5 }], T + 3);
    expect(match.monsters["zombie-0"]).toMatchObject({ x: 11, z: 9, yaw: 0.5 });
  });
});

describe("shootMonster", () => {
  it("damages, records and kills on the third hit", () => {
    const { match, secret, poses } = playing();
    for (let i = 0; i < 3; i++) shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + i * 100);
    expect(match.monsters["zombie-0"]).toMatchObject({ hp: 0, alive: false });
    expect(secret.stats.a).toMatchObject({ monsterDamage: 100, monsterKills: 1 });
    expect(secret.lastShotAt.a).toBe(T + 200);
    expect(() => shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 300)).toThrow("monster_dead");
  });

  it("enforces the fire interval", () => {
    const { match, secret, poses } = playing();
    shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T);
    expect(() => shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 99)).toThrow("too_fast");
    expect(() => shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 100)).not.toThrow();
  });

  it("checks range from the shooter's reported position", () => {
    const { match, secret, poses } = playing();
    match.monsters["zombie-1"].x = 70;
    expect(() => shootMonster(match, secret, "a", "zombie-1", poses.a, poses, T)).toThrow("out_of_range");
    expect(() => shootMonster(match, secret, "a", "zombie-0", null, poses, T)).toThrow("out_of_range");
  });

  it("refuses shooters who cannot act and targets that do not exist", () => {
    const { match, secret, poses } = possessing();
    expect(() => shootMonster(match, secret, "c", "zombie-1", poses.c, poses, T + 1)).toThrow("unavailable");
    expect(() => shootMonster(match, secret, "a", "zombie-9", poses.a, poses, T + 1)).toThrow("no_monster");
    match.escaped.push("b");
    expect(() => shootMonster(match, secret, "b", "zombie-0", poses.b, poses, T + 1)).toThrow("unavailable");
    match.phase = "ended";
    expect(() => shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 1)).toThrow("not_playing");
  });

  it("hurts the possessing body and makes it scream to nearby players", () => {
    const { match, secret, poses } = possessing();
    const events = shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 1);
    const link = Math.round(AKM_DAMAGE * 0.4);
    expect(events).toEqual([
      { type: "pain", x: 5, z: 10, to: ["a", "b"] },
      { type: "private", account: "c" },
    ]);
    expect(secret.hp.c).toBe(100 - link);
    expect(secret.stats.a.traitorDamage).toBe(link);
    expect(secret.possession).not.toBeNull();
  });

  it("hits the body harder and ends the possession when the possessed monster dies", () => {
    const { match, secret, poses } = possessing();
    match.monsters["zombie-0"].hp = 30;
    const events = shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 1);
    expect(secret.hp.c).toBe(100 - (Math.round(30 * 0.4) + MONSTER_DEATH_BODY_DAMAGE));
    expect(secret.possession).toBeNull();
    expect(secret.readyAt).toBe(T + 1 + POSSESS_COOLDOWN_MS);
    expect(events).toContainEqual({ type: "possession", monsterId: "zombie-0", active: false, endsAt: null });
    expect(secret.stats.a.monsterKills).toBe(1);
  });

  it("can kill the traitor through the link", () => {
    const { match, secret, poses } = possessing();
    secret.hp.c = 10;
    shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 1);
    expect(secret.hp.c).toBe(0);
    expect(match.dead).toEqual(["c"]);
    expect(secret.possession).toBeNull();
    expect(secret.stats.a.traitorDamage).toBe(10);
  });

  it("does no link damage once the possession has run out", () => {
    const { match, secret, poses } = possessing();
    const events = shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + POSSESS_DURATION_MS);
    expect(secret.hp.c).toBe(100);
    expect(events).toEqual([
      { type: "possession", monsterId: "zombie-0", active: false, endsAt: null },
      { type: "private", account: "c" },
    ]);
  });
});

describe("shootPlayer", () => {
  it("allows friendly fire and records it", () => {
    const { match, secret, poses } = playing();
    const events = shootPlayer(match, secret, "a", "b", poses.a, poses.b, T);
    expect(events).toEqual([{ type: "private", account: "b" }]);
    expect(secret.hp.b).toBe(100 - AKM_DAMAGE);
    expect(secret.stats.a).toMatchObject({ playerDamage: AKM_DAMAGE, traitorDamage: 0 });
  });

  it("breaks the possession and stuns the monster when the frozen body is shot", () => {
    const { match, secret, poses } = possessing();
    shootPlayer(match, secret, "a", "c", poses.a, poses.c, T + 1);
    expect(secret.possession).toBeNull();
    expect(match.monsters["zombie-0"].stunnedUntil).toBe(T + 1 + BODY_HIT_STUN_MS);
    expect(secret.hp.c).toBe(100 - AKM_DAMAGE);
    expect(secret.stats.a.traitorDamage).toBe(AKM_DAMAGE);
  });

  it("marks a player dead at zero hp", () => {
    const { match, secret, poses } = playing();
    secret.hp.b = 20;
    shootPlayer(match, secret, "a", "b", poses.a, poses.b, T);
    expect(secret.hp.b).toBe(0);
    expect(match.dead).toEqual(["b"]);
    expect(secret.stats.a.playerDamage).toBe(20);
  });

  it("refuses bad targets", () => {
    const { match, secret, poses } = playing();
    expect(() => shootPlayer(match, secret, "a", "a", poses.a, poses.a, T)).toThrow("no_target");
    expect(() => shootPlayer(match, secret, "a", "z", poses.a, at(0, 0), T)).toThrow("no_target");
    expect(() => shootPlayer(match, secret, "a", "b", poses.a, null, T)).toThrow("out_of_range");
    match.dead.push("b");
    expect(() => shootPlayer(match, secret, "a", "b", poses.a, poses.b, T)).toThrow("no_target");
  });
});

describe("monsterAttack", () => {
  it("lets the host's monster hit a nearby player on an interval", () => {
    const { match, secret, poses } = playing();
    monsterAttack(match, secret, "a", "zombie-0", "b", poses.b, T);
    expect(secret.hp.b).toBe(100 - ZOMBIE_ATTACK_DAMAGE);
    expect(match.monsters["zombie-0"].attackReadyAt).toBe(T + ZOMBIE_ATTACK_INTERVAL_MS);
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "b", poses.b, T + 1)).toThrow("too_fast");
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "b", poses.b, T + ZOMBIE_ATTACK_INTERVAL_MS)).not.toThrow();
  });

  it("only takes orders from the monster's authority", () => {
    const { match, secret, poses } = possessing();
    expect(() => monsterAttack(match, secret, "b", "zombie-1", "d", at(50, 10), T + 1)).toThrow("not_authority");
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "b", poses.b, T + 1)).toThrow("not_authority");
    monsterAttack(match, secret, "c", "zombie-0", "b", poses.b, T + 1);
    expect(secret.stats.c.possessedDamage).toBe(ZOMBIE_ATTACK_DAMAGE);
  });

  it("refuses stunned monsters and far targets", () => {
    const { match, secret, poses } = playing();
    match.monsters["zombie-0"].stunnedUntil = T + 10;
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "b", poses.b, T)).toThrow("stunned");
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "d", poses.d, T + 10)).toThrow("out_of_range");
  });
});

describe("reachExit", () => {
  const exits = [{ x: 0, z: 10 }];

  it("lets an active player standing at an exit escape, once", () => {
    const { match, secret, poses } = playing();
    reachExit(match, secret, "a", poses.a, exits, T);
    expect(match.escaped).toEqual(["a"]);
    expect(() => reachExit(match, secret, "a", poses.a, exits, T)).toThrow("unavailable");
    expect(() => reachExit(match, secret, "b", poses.b, exits, T)).toThrow("not_at_exit");
  });

  it("ends the traitor's possession if the traitor escapes", () => {
    const { match, secret } = possessing();
    reachExit(match, secret, "c", at(1, 10), exits, T + 1);
    expect(match.escaped).toEqual(["c"]);
    expect(secret.possession).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/match/damage.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/game/match/damage"`

- [ ] **Step 3: 구현** — `src/game/match/damage.ts`

```ts
import {
  AKM_DAMAGE, AKM_FIRE_INTERVAL_MS, AKM_RANGE, BODY_HIT_STUN_MS, EXIT_RADIUS, LINK_DAMAGE_RATIO,
  MONSTER_DEATH_BODY_DAMAGE, PAIN_RADIUS, RANGE_SLACK, ZOMBIE_ATTACK_DAMAGE, ZOMBIE_ATTACK_INTERVAL_MS,
  ZOMBIE_ATTACK_RANGE,
} from "./constants";
import { isActive } from "./lifecycle";
import { endPossession, expirePossession } from "./possession";
import {
  RuleViolation, type MatchEvent, type Pose, type Poses, type PublicMatch, type SecretMatch, type Vec2,
} from "./types";
import { distance, nearbyAccounts } from "./view";

export interface MonsterPoseUpdate { id: string; x: number; z: number; yaw: number }

export function monsterAuthority(match: PublicMatch, secret: SecretMatch, monsterId: string): string | null {
  if (secret.possession?.monsterId === monsterId) return secret.traitor;
  return match.players.find((p) => isActive(match, p)) ?? null;
}

export function applyMonsterPoses(
  match: PublicMatch, secret: SecretMatch, caller: string, updates: MonsterPoseUpdate[], now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") return events;
  for (const u of updates) {
    const monster = match.monsters[u.id];
    if (!monster || !monster.alive) continue;
    if (![u.x, u.z, u.yaw].every(Number.isFinite)) continue;
    if (monsterAuthority(match, secret, u.id) !== caller) continue;
    monster.x = u.x;
    monster.z = u.z;
    monster.yaw = u.yaw;
  }
  return events;
}

export function shootMonster(
  match: PublicMatch, secret: SecretMatch, shooter: string, monsterId: string,
  shooterPose: Pose | null, poses: Poses, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  const from = beginShot(match, secret, shooter, shooterPose, now);
  const monster = match.monsters[monsterId];
  if (!monster) throw new RuleViolation("no_monster");
  if (!monster.alive) throw new RuleViolation("monster_dead");
  if (distance(from, monster) > AKM_RANGE + RANGE_SLACK) throw new RuleViolation("out_of_range");

  secret.lastShotAt[shooter] = now;
  const dealt = Math.min(AKM_DAMAGE, monster.hp);
  monster.hp -= dealt;
  const stats = secret.stats[shooter];
  stats.monsterDamage += dealt;
  const killed = monster.hp === 0;
  if (killed) {
    monster.alive = false;
    stats.monsterKills += 1;
  }

  if (monster.possessed) {
    const traitor = secret.traitor;
    const body = Math.round(dealt * LINK_DAMAGE_RATIO) + (killed ? MONSTER_DEATH_BODY_DAMAGE : 0);
    const applied = Math.min(body, secret.hp[traitor] ?? 0);
    if (shooter !== traitor) stats.traitorDamage += applied;
    const bodyPose = poses[traitor];
    if (bodyPose) {
      events.push({ type: "pain", x: bodyPose.x, z: bodyPose.z, to: nearbyAccounts(poses, bodyPose, PAIN_RADIUS, traitor) });
    }
    events.push(...damageBody(match, secret, traitor, body, now));
    if (killed) events.push(...endPossession(match, secret, now));
  }
  return events;
}

export function shootPlayer(
  match: PublicMatch, secret: SecretMatch, shooter: string, target: string,
  shooterPose: Pose | null, targetPose: Pose | null, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  const from = beginShot(match, secret, shooter, shooterPose, now);
  if (target === shooter || !isActive(match, target)) throw new RuleViolation("no_target");
  if (!targetPose || distance(from, targetPose) > AKM_RANGE + RANGE_SLACK) throw new RuleViolation("out_of_range");

  secret.lastShotAt[shooter] = now;
  const applied = Math.min(AKM_DAMAGE, secret.hp[target] ?? 0);
  const stats = secret.stats[shooter];
  stats.playerDamage += applied;
  if (target === secret.traitor) {
    stats.traitorDamage += applied;
    const possession = secret.possession;
    if (possession) {
      events.push(...endPossession(match, secret, now));
      const monster = match.monsters[possession.monsterId];
      if (monster) monster.stunnedUntil = now + BODY_HIT_STUN_MS;
    }
  }
  events.push(...damageBody(match, secret, target, AKM_DAMAGE, now));
  return events;
}

export function monsterAttack(
  match: PublicMatch, secret: SecretMatch, caller: string, monsterId: string,
  target: string, targetPose: Pose | null, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  const monster = match.monsters[monsterId];
  if (!monster) throw new RuleViolation("no_monster");
  if (!monster.alive) throw new RuleViolation("monster_dead");
  if (monsterAuthority(match, secret, monsterId) !== caller) throw new RuleViolation("not_authority");
  if (now < monster.stunnedUntil) throw new RuleViolation("stunned");
  if (now < monster.attackReadyAt) throw new RuleViolation("too_fast");
  if (!isActive(match, target)) throw new RuleViolation("no_target");
  if (!targetPose || distance(monster, targetPose) > ZOMBIE_ATTACK_RANGE + RANGE_SLACK) {
    throw new RuleViolation("out_of_range");
  }

  monster.attackReadyAt = now + ZOMBIE_ATTACK_INTERVAL_MS;
  if (monster.possessed) {
    secret.stats[secret.traitor].possessedDamage += Math.min(ZOMBIE_ATTACK_DAMAGE, secret.hp[target] ?? 0);
  }
  events.push(...damageBody(match, secret, target, ZOMBIE_ATTACK_DAMAGE, now));
  return events;
}

export function reachExit(
  match: PublicMatch, secret: SecretMatch, account: string, pose: Pose | null, exits: Vec2[], now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (!isActive(match, account)) throw new RuleViolation("unavailable");
  if (!pose || !exits.some((e) => distance(pose, e) <= EXIT_RADIUS)) throw new RuleViolation("not_at_exit");
  match.escaped.push(account);
  if (account === secret.traitor) events.push(...endPossession(match, secret, now));
  return events;
}

function beginShot(match: PublicMatch, secret: SecretMatch, shooter: string, shooterPose: Pose | null, now: number): Pose {
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (!isActive(match, shooter)) throw new RuleViolation("unavailable");
  // A possessing traitor's body stands frozen; it cannot shoot.
  if (secret.possession && secret.traitor === shooter) throw new RuleViolation("unavailable");
  const last = secret.lastShotAt[shooter];
  if (last !== undefined && now - last < AKM_FIRE_INTERVAL_MS) throw new RuleViolation("too_fast");
  if (!shooterPose) throw new RuleViolation("out_of_range");
  return shooterPose;
}

function damageBody(match: PublicMatch, secret: SecretMatch, account: string, amount: number, now: number): MatchEvent[] {
  const hp = Math.max(0, (secret.hp[account] ?? 0) - amount);
  secret.hp[account] = hp;
  const events: MatchEvent[] = [{ type: "private", account }];
  if (hp === 0 && !match.dead.includes(account)) {
    match.dead.push(account);
    if (account === secret.traitor) events.push(...endPossession(match, secret, now));
  }
  return events;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/match && npm run typecheck`
Expected: PASS (lifecycle 11 + view 5 + possession 11 + damage 19 = 46 tests), 타입 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/game/match/damage.ts tests/match/damage.test.ts
git commit -m "feat: shooting, monster attacks and possession link damage rules"
```

---

### Task 5: 이탈·승패 판정·판 결과·누적 전적

**Files:**
- Create: `src/game/match/outcome.ts`
- Create: `src/game/match/profile.ts`
- Test: `tests/match/outcome.test.ts`
- Test: `tests/match/profile.test.ts`

**Interfaces:**
- Consumes: `endPossession`, `expirePossession` (Task 3), 타입 (Task 2)
- Produces (`outcome.ts`):
  ```ts
  export function markLeft(match: PublicMatch, secret: SecretMatch | null, account: string, now: number): MatchEvent[]
  export function resolveOutcome(match: PublicMatch, secret: SecretMatch | null, now: number): MatchEvent[]
  export function settleResults(match: PublicMatch, secret: SecretMatch): PlayerResult[]
  ```
- Produces (`profile.ts`):
  ```ts
  export interface Profile {
    version: 1; games: number; wins: number;
    adventurerGames: number; adventurerWins: number; traitorGames: number; traitorWins: number;
    escapes: number; deaths: number; monsterKills: number; traitorDamage: number; possessions: number;
    lastPlayedAt: number;
  }
  export function emptyProfile(): Profile
  export function readProfile(raw: unknown): Profile     // 저장된 값이 없거나 깨져 있어도 안전하게 읽음
  export function addResult(profile: Profile, result: PlayerResult): Profile   // 새 객체를 돌려줌
  ```
- 규칙 요약
  - 경기 중 이탈 = 사망 처리(체력 0). 배신자가 이탈하면 빙의도 끝난다. 로비 이탈은 서버가 `leaveLobby`로 처리한다.
  - 판정은 먼저 빙의 만료를 처리한 뒤, 배신자를 뺀 모험가 중 "살아서 아직 안 나간" 사람이 0명이면 끝낸다: 탈출자 ≥ 1이면 모험가 승(`escaped`), 아니면 배신자 승(`wiped`). 남은 사람이 있는데 시간이 끝났으면 배신자 승(`timeout`).
  - 배신자 본인의 생사·탈출은 판정에 영향이 없다.
  - 종료 시각(`endedAt`): 시간 초과면 `endsAt`, 그 외에는 판정한 시각.
  - 승패는 팀 단위다. 모험가 팀이 이기면 죽은 모험가도 승리로 기록한다.

- [ ] **Step 1: 실패하는 테스트** — `tests/match/outcome.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { MATCH_DURATION_MS, POSSESS_FIRST_READY_MS } from "../../src/game/match/constants";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { markLeft, resolveOutcome, settleResults } from "../../src/game/match/outcome";
import { startPossession } from "../../src/game/match/possession";

const START = 1000;
const END = START + MATCH_DURATION_MS;

// Traitor is "c"; adventurers are a, b, d.
function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  const secret = startMatch(match, START, () => 0.6, [{ id: "zombie-0", x: 0, z: 0 }]);
  return { match, secret };
}

describe("resolveOutcome", () => {
  it("does nothing while adventurers are still inside and time remains", () => {
    const { match, secret } = playing();
    match.escaped.push("a");
    expect(resolveOutcome(match, secret, START + 5)).toEqual([]);
    expect(match.phase).toBe("playing");
  });

  it("gives the adventurers the win once every living adventurer is out", () => {
    const { match, secret } = playing();
    match.escaped.push("a", "d");
    match.dead.push("b");
    const events = resolveOutcome(match, secret, START + 5000);
    expect(events).toEqual([{ type: "ended" }]);
    expect(match.phase).toBe("ended");
    expect(match.endedAt).toBe(START + 5000);
    expect(match.result).toEqual({ winner: "adventurers", reason: "escaped", traitor: "c" });
  });

  it("gives the traitor the win when every adventurer is dead", () => {
    const { match, secret } = playing();
    match.dead.push("a", "b", "d");
    resolveOutcome(match, secret, START + 10);
    expect(match.result).toEqual({ winner: "traitor", reason: "wiped", traitor: "c" });
  });

  it("gives the traitor the win on timeout, dated at the deadline", () => {
    const { match, secret } = playing();
    expect(resolveOutcome(match, secret, END - 1)).toEqual([]);
    resolveOutcome(match, secret, END + 60_000);
    expect(match.result).toEqual({ winner: "traitor", reason: "timeout", traitor: "c" });
    expect(match.endedAt).toBe(END);
  });

  it("ignores what happens to the traitor", () => {
    const { match, secret } = playing();
    match.dead.push("c");
    expect(resolveOutcome(match, secret, START + 10)).toEqual([]);
  });

  it("ends a running possession before announcing the end, and only ends once", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", { x: 0, z: 1 }, START + POSSESS_FIRST_READY_MS);
    match.dead.push("a", "b", "d");
    const events = resolveOutcome(match, secret, START + POSSESS_FIRST_READY_MS + 1);
    expect(events.map((e) => e.type)).toEqual(["possession", "private", "ended"]);
    expect(secret.possession).toBeNull();
    expect(match.monsters["zombie-0"].possessed).toBe(false);
    expect(resolveOutcome(match, secret, START + POSSESS_FIRST_READY_MS + 2)).toEqual([]);
  });

  it("does nothing without a secret or outside play", () => {
    const { match, secret } = playing();
    expect(resolveOutcome(match, null, END + 1)).toEqual([]);
    match.phase = "lobby";
    expect(resolveOutcome(match, secret, END + 1)).toEqual([]);
  });
});

describe("markLeft", () => {
  it("counts a player who leaves mid-match as dead", () => {
    const { match, secret } = playing();
    expect(markLeft(match, secret, "a", START + 1)).toEqual([]);
    expect(match.dead).toEqual(["a"]);
    expect(secret.hp.a).toBe(0);
  });

  it("ends the traitor's possession when the traitor leaves", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", { x: 0, z: 1 }, START + POSSESS_FIRST_READY_MS);
    const events = markLeft(match, secret, "c", START + POSSESS_FIRST_READY_MS + 1);
    expect(events.map((e) => e.type)).toEqual(["possession", "private"]);
    expect(match.dead).toEqual(["c"]);
  });

  it("ignores strangers, the already gone, and matches not in play", () => {
    const { match, secret } = playing();
    match.escaped.push("b");
    markLeft(match, secret, "b", START + 1);
    markLeft(match, secret, "zz", START + 1);
    expect(match.dead).toEqual([]);
    match.phase = "ended";
    markLeft(match, secret, "a", START + 1);
    expect(match.dead).toEqual([]);
  });
});

describe("settleResults", () => {
  it("writes one result per player with team-based wins", () => {
    const { match, secret } = playing();
    secret.stats.a.monsterKills = 2;
    match.escaped.push("a", "d");
    match.dead.push("b");
    resolveOutcome(match, secret, START + 5000);
    const results = settleResults(match, secret);
    expect(results.map((r) => [r.account, r.role, r.won, r.escaped, r.died])).toEqual([
      ["a", "adventurer", true, true, false],
      ["b", "adventurer", true, false, true],
      ["c", "traitor", false, false, false],
      ["d", "adventurer", true, true, false],
    ]);
    expect(results[0]).toMatchObject({ reason: "escaped", durationMs: 5000, endedAt: START + 5000 });
    expect(results[0].stats.monsterKills).toBe(2);
  });

  it("copies stats instead of sharing them", () => {
    const { match, secret } = playing();
    match.dead.push("a", "b", "d");
    resolveOutcome(match, secret, START + 1);
    const [first] = settleResults(match, secret);
    first.stats.monsterKills = 99;
    expect(secret.stats.a.monsterKills).toBe(0);
  });

  it("refuses to settle a match that has not ended", () => {
    const { match, secret } = playing();
    expect(() => settleResults(match, secret)).toThrow("not_playing");
  });
});
```

- [ ] **Step 2: 실패하는 테스트** — `tests/match/profile.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { emptyStats } from "../../src/game/match/lifecycle";
import { addResult, emptyProfile, readProfile } from "../../src/game/match/profile";
import type { PlayerResult } from "../../src/game/match/types";

function result(over: Partial<PlayerResult>): PlayerResult {
  return {
    account: "a", role: "adventurer", won: false, escaped: false, died: false,
    reason: "timeout", durationMs: 1000, endedAt: 5000, stats: emptyStats(), ...over,
  };
}

describe("readProfile", () => {
  it("returns an empty profile for missing or broken data", () => {
    expect(readProfile(undefined)).toEqual(emptyProfile());
    expect(readProfile("nope")).toEqual(emptyProfile());
    expect(readProfile({ games: "3", wins: -1, escapes: 2 })).toEqual({ ...emptyProfile(), escapes: 2 });
  });
});

describe("addResult", () => {
  it("counts an adventurer win with an escape and kills", () => {
    const stats = { ...emptyStats(), monsterKills: 3, traitorDamage: 40 };
    const next = addResult(emptyProfile(), result({ won: true, escaped: true, stats }));
    expect(next).toEqual({
      ...emptyProfile(),
      games: 1, wins: 1, adventurerGames: 1, adventurerWins: 1,
      escapes: 1, monsterKills: 3, traitorDamage: 40, lastPlayedAt: 5000,
    });
  });

  it("counts a traitor loss with possessions and a death", () => {
    const stats = { ...emptyStats(), possessions: 2 };
    const next = addResult(emptyProfile(), result({ role: "traitor", died: true, stats }));
    expect(next).toMatchObject({ games: 1, wins: 0, traitorGames: 1, traitorWins: 0, deaths: 1, possessions: 2 });
  });

  it("does not change the profile it was given", () => {
    const before = emptyProfile();
    addResult(before, result({ won: true }));
    expect(before).toEqual(emptyProfile());
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/match/outcome.test.ts tests/match/profile.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/game/match/outcome"` / `.../profile"`

- [ ] **Step 4: 구현** — `src/game/match/outcome.ts`

```ts
import { endPossession, expirePossession } from "./possession";
import {
  RuleViolation, type EndReason, type MatchEvent, type PlayerResult, type PublicMatch, type SecretMatch, type Winner,
} from "./types";

export function markLeft(match: PublicMatch, secret: SecretMatch | null, account: string, now: number): MatchEvent[] {
  if (match.phase !== "playing" || !secret) return [];
  if (!match.players.includes(account) || match.dead.includes(account) || match.escaped.includes(account)) return [];
  match.dead.push(account);
  secret.hp[account] = 0;
  return account === secret.traitor ? endPossession(match, secret, now) : [];
}

export function resolveOutcome(match: PublicMatch, secret: SecretMatch | null, now: number): MatchEvent[] {
  if (match.phase !== "playing" || !secret) return [];
  const events = expirePossession(match, secret, now);
  const adventurers = match.players.filter((p) => p !== secret.traitor);
  const inside = adventurers.filter((p) => !match.dead.includes(p) && !match.escaped.includes(p));
  const escaped = adventurers.filter((p) => match.escaped.includes(p));

  let end: { winner: Winner; reason: EndReason; at: number } | null = null;
  if (inside.length === 0) {
    end = escaped.length > 0
      ? { winner: "adventurers", reason: "escaped", at: now }
      : { winner: "traitor", reason: "wiped", at: now };
  } else if (match.endsAt !== null && now >= match.endsAt) {
    end = { winner: "traitor", reason: "timeout", at: match.endsAt };
  }
  if (!end) return events;

  events.push(...endPossession(match, secret, end.at));
  match.phase = "ended";
  match.endedAt = end.at;
  match.result = { winner: end.winner, reason: end.reason, traitor: secret.traitor };
  events.push({ type: "ended" });
  return events;
}

export function settleResults(match: PublicMatch, secret: SecretMatch): PlayerResult[] {
  const result = match.result;
  if (match.phase !== "ended" || !result || match.startedAt === null || match.endedAt === null) {
    throw new RuleViolation("not_playing");
  }
  const startedAt = match.startedAt;
  const endedAt = match.endedAt;
  return match.players.map((account) => {
    const role = account === secret.traitor ? "traitor" : "adventurer";
    return {
      account,
      role,
      won: (role === "traitor") === (result.winner === "traitor"),
      escaped: match.escaped.includes(account),
      died: match.dead.includes(account),
      reason: result.reason,
      durationMs: endedAt - startedAt,
      endedAt,
      stats: { ...secret.stats[account] },
    };
  });
}
```

- [ ] **Step 5: 구현** — `src/game/match/profile.ts`

```ts
import type { PlayerResult } from "./types";

export interface Profile {
  version: 1;
  games: number;
  wins: number;
  adventurerGames: number;
  adventurerWins: number;
  traitorGames: number;
  traitorWins: number;
  escapes: number;
  deaths: number;
  monsterKills: number;
  traitorDamage: number;
  possessions: number;
  lastPlayedAt: number;
}

type Counter = Exclude<keyof Profile, "version">;

const COUNTERS: Counter[] = [
  "games", "wins", "adventurerGames", "adventurerWins", "traitorGames", "traitorWins",
  "escapes", "deaths", "monsterKills", "traitorDamage", "possessions", "lastPlayedAt",
];

export function emptyProfile(): Profile {
  return {
    version: 1, games: 0, wins: 0, adventurerGames: 0, adventurerWins: 0, traitorGames: 0, traitorWins: 0,
    escapes: 0, deaths: 0, monsterKills: 0, traitorDamage: 0, possessions: 0, lastPlayedAt: 0,
  };
}

export function readProfile(raw: unknown): Profile {
  const profile = emptyProfile();
  if (!raw || typeof raw !== "object") return profile;
  const source = raw as Record<string, unknown>;
  for (const key of COUNTERS) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) profile[key] = value;
  }
  return profile;
}

export function addResult(profile: Profile, result: PlayerResult): Profile {
  const traitor = result.role === "traitor";
  const win = result.won ? 1 : 0;
  return {
    ...profile,
    games: profile.games + 1,
    wins: profile.wins + win,
    adventurerGames: profile.adventurerGames + (traitor ? 0 : 1),
    adventurerWins: profile.adventurerWins + (traitor ? 0 : win),
    traitorGames: profile.traitorGames + (traitor ? 1 : 0),
    traitorWins: profile.traitorWins + (traitor ? win : 0),
    escapes: profile.escapes + (result.escaped ? 1 : 0),
    deaths: profile.deaths + (result.died ? 1 : 0),
    monsterKills: profile.monsterKills + result.stats.monsterKills,
    traitorDamage: profile.traitorDamage + result.stats.traitorDamage,
    possessions: profile.possessions + result.stats.possessions,
    lastPlayedAt: Math.max(profile.lastPlayedAt, result.endedAt),
  };
}
```

- [ ] **Step 6: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: 전체 PASS (기존 32 + match 46 + outcome 13 + profile 4 = 95 tests), 타입 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add src/game/match/outcome.ts src/game/match/profile.ts tests/match/outcome.test.ts tests/match/profile.test.ts
git commit -m "feat: match outcome, per-player results and lifetime profile"
```

---

### Task 6: 서버 프로젝트 — 방 찾기, 상태 조회, 이탈, 종료·정산, 주기 판정

사전 확인한 로컬 테스트 도구 동작(2026-09-17, `@agent8/gameserver-node` 0.1.13):
- `server/src/server.ts`가 `../../src/...`를 import해도 esbuild가 하나로 묶는다. `instanceof RuleViolation`도 동작한다.
- 서버에서 던진 오류의 메시지(오류 코드)가 테스트 쪽 `catch`까지 전달된다.
- `server.connect({ account, roomId })`는 `$sender`만 바꾸고 **`$room`은 기본 방(`test-room`)에 그대로 묶여 있다.** 그래서 서버 코드는 상태를 전부 `$global.getRoomState(roomId)` 같은 방 ID 지정 API로 읽고 쓴다. `$room`은 메시지 보낼 때만 쓴다(실서비스에서는 보낸 사람의 방으로 간다).
- 테스트에서 `$room.sendMessageToUser`/`$room.broadcastToRoom`을 바꿔 끼우면 보낸 메시지를 잡을 수 있다.
- 없는 컬렉션 항목을 읽으면 예외가 난다. 없는 방 사용자 상태는 `{}`다.
- `$global.joinRoom()`은 같은 호출 안의 `$sender.roomId`를 바꾸지 않는다.
- 각 테스트는 새 상태·새 서버로 시작한다.
- **서버 테스트에서 `expect(...).not`을 쓰지 않는다.** 로컬 러너의 `.not`이 무한 호출로 "Maximum call stack size exceeded"를 낸다. `expect(조건).toBe(false)`로 쓴다. (vitest 쪽 `tests/`는 문제없음)

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`
- Create: `server/src/store.ts`, `server/src/server.ts`
- Create: `server/test/test-globals.d.ts`, `server/test/helpers.ts`, `server/test/match.test.ts`
- Modify: `package.json` (루트 스크립트)

**Interfaces:**
- Consumes: `src/game/match/*` 전체, `src/game/rules/levelLayout.ts` (`parseLevel`, `LEVEL_1`, `TILE_SIZE`, `exits`)
- Produces (클라이언트가 `remoteFunction`으로 부르는 이름 — Plan 3이 사용):
  ```ts
  getServerVersion(): Promise<{ protocol: number }>
  findMatch(): Promise<{ roomId: string }>          // 로비 방을 골라(없으면 생성) 입장, 4명이 되면 시작
  leaveMatch(): Promise<void>                       // 로비면 자리 비움, 경기 중이면 사망 처리
  getMatchState(): Promise<MatchSnapshot>           // { roomId, serverNow, match: PublicMatch, you: PrivateView }
  syncMatch(): Promise<void>                        // 시간 경과 판정만 (클라이언트가 ~1초마다 needResponse:false로 호출)
  devAdvanceClock(ms: number): Promise<number>      // test- 계정 전용
  $roomTick(deltaMillis: number, roomId: string): Promise<void>
  ```
- 방 메시지 (`onRoomMessage` 타입 이름 — Plan 3이 사용):
  - `private` → 한 사람에게: `PrivateView`
  - `pain` → 비명을 들은 사람에게: `{ x, z }`
  - `possession` → 방 전체: `{ monsterId, active, endsAt }` (누가 빙의했는지는 없음)
  - `ended` → 방 전체: `{ result, results }`
- 방 상태: `match` 키 하나에 `PublicMatch`. 판 결과 문서: 전역 컬렉션 `match_results`. 누적 전적: 전역 사용자 상태 `profile`.

- [ ] **Step 1: 서버 패키지** — `server/package.json`

```json
{
  "name": "traitor-hunt-server",
  "private": true,
  "description": "Traitor Hunt Verse8 game server",
  "scripts": {
    "build": "gameserver-node build",
    "test": "gameserver-node test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@agent8/gameserver-node": "0.1.13",
    "typescript": "~5.7.3"
  }
}
```

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["@agent8/gameserver-node"]
  },
  "include": [
    "src/**/*",
    "test/**/*",
    "../src/game/match/**/*",
    "../src/game/rules/**/*",
    "./node_modules/@agent8/gameserver-node/types/**/*.d.ts"
  ]
}
```

`server/test/test-globals.d.ts`:
```ts
declare function describe(name: string, fn: () => void): void;
declare function test(name: string, fn: (server: any) => void | Promise<void>): void;
declare function expect(actual: any): any;
```

루트 `package.json`의 `scripts`에 추가:
```json
    "server:install": "npm --prefix server install",
    "server:test": "npm --prefix server test",
    "server:build": "npm --prefix server run build",
    "server:typecheck": "npm --prefix server run typecheck",
```

(`node_modules/`, `dist/`는 루트 `.gitignore`에 이미 있어 `server/node_modules`, `server/dist`도 제외된다.)

Run: `npm run server:install`
Expected: 에러 없이 `server/node_modules/@agent8/gameserver-node` 생성.

- [ ] **Step 2: 저장소 모듈** — `server/src/store.ts`

```ts
import { addResult, readProfile } from "../../src/game/match/profile";
import type {
  PlayerResult, Pose, Poses, PublicMatch, SecretMatch, SecretRef,
} from "../../src/game/match/types";

export const RESULTS_COLLECTION = "match_results";

export function token(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 36).toString(36);
  return out;
}

export function newRoomId(now: number): string {
  return `de-${now.toString(36)}-${token(6)}`;
}

export function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  return $lock(`de-room-${roomId}`, fn);
}

export function withMatchmakingLock<T>(fn: () => Promise<T>): Promise<T> {
  return $lock("de-matchmaking", fn);
}

function isMatch(value: unknown): value is PublicMatch {
  return !!value && typeof value === "object" && (value as { version?: unknown }).version === 1;
}

export async function readMatch(roomId: string): Promise<PublicMatch | null> {
  const state = await $global.getRoomState(roomId);
  return isMatch(state.match) ? state.match : null;
}

export async function writeMatch(roomId: string, match: PublicMatch): Promise<void> {
  await $global.updateRoomState(roomId, { match });
}

export async function listLobbies(): Promise<{ roomId: string; match: PublicMatch }[]> {
  const lobbies: { roomId: string; match: PublicMatch }[] = [];
  for (const state of await $global.getAllRoomStates()) {
    if (typeof state.roomId === "string" && isMatch(state.match) && state.match.phase === "lobby") {
      lobbies.push({ roomId: state.roomId, match: state.match });
    }
  }
  return lobbies;
}

// Readable by any client that learns the name: obscurity only, by design (see plan decisions).
export async function createSecret(secret: SecretMatch): Promise<SecretRef> {
  const collection = `ds_${token(24)}`;
  const item = await $global.addCollectionItem(collection, { secret });
  return { collection, id: item.__id };
}

export async function readSecret(match: PublicMatch): Promise<SecretMatch | null> {
  const ref = match.secretRef;
  if (!ref) return null;
  const item = await $global.getCollectionItem(ref.collection, ref.id);
  return (item.secret as SecretMatch | undefined) ?? null;
}

export async function writeSecret(match: PublicMatch, secret: SecretMatch): Promise<void> {
  const ref = match.secretRef;
  if (ref) await $global.updateCollectionItem(ref.collection, { __id: ref.id, secret });
}

export async function deleteSecret(match: PublicMatch): Promise<void> {
  if (match.secretRef) await $global.deleteCollection(match.secretRef.collection);
}

export function isPose(value: unknown): value is Pose {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return [p.x, p.z, p.yaw].every((n) => typeof n === "number" && Number.isFinite(n));
}

export async function readPose(roomId: string, account: string): Promise<Pose | null> {
  const pose: unknown = (await $global.getRoomUserState(roomId, account)).pose;
  return isPose(pose) ? { x: pose.x, z: pose.z, yaw: pose.yaw } : null;
}

export async function readPoses(roomId: string, accounts: string[]): Promise<Poses> {
  const poses: Poses = {};
  for (const account of accounts) poses[account] = await readPose(roomId, account);
  return poses;
}

export async function writePose(roomId: string, account: string, pose: Pose, at: number): Promise<void> {
  await $global.updateRoomUserState(roomId, account, { pose: { x: pose.x, z: pose.z, yaw: pose.yaw, at } });
}

export async function saveResults(matchId: string, results: PlayerResult[]): Promise<void> {
  for (const result of results) {
    await $global.addCollectionItem(RESULTS_COLLECTION, { ...result, matchId });
    const state = await $global.getUserState(result.account);
    await $global.updateUserState(result.account, { profile: addResult(readProfile(state.profile), result) });
  }
}
```

- [ ] **Step 3: 테스트 도우미** — `server/test/helpers.ts`

```ts
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
```

- [ ] **Step 4: 실패하는 테스트** — `server/test/match.test.ts`

```ts
import { PLAYERS, actAs, errorOf, fillRoom, findTraitor, roomMatch } from "./helpers";

const EIGHT_MINUTES = 8 * 60_000;

describe("matchmaking", () => {
  test("reports the protocol version", async (server) => {
    expect(await server.getServerVersion()).toEqual({ protocol: 1 });
  });

  test("fills one room with four players and starts with exactly one hidden traitor", async (server) => {
    const roomId = await fillRoom(server);
    actAs(server, PLAYERS[0], roomId);
    const snapshot = await server.getMatchState();
    expect(snapshot.roomId).toBe(roomId);
    expect(snapshot.match.phase).toBe("playing");
    expect(snapshot.match.players).toEqual(PLAYERS);
    // The local runner's `.not` recurses forever (gameserver-node 0.1.13), so assert on a boolean.
    expect(JSON.stringify(snapshot.match).includes("traitor")).toBe(false);
    let traitors = 0;
    for (const account of PLAYERS) {
      actAs(server, account, roomId);
      const you = (await server.getMatchState()).you;
      expect(you.hp).toBe(100);
      if (you.role === "traitor") traitors += 1;
    }
    expect(traitors).toBe(1);
  });

  test("puts a fifth player in a new lobby", async (server) => {
    const first = await fillRoom(server);
    server.connect({ account: "test-e" });
    const second = (await server.findMatch()).roomId;
    expect(second === first).toBe(false);
    actAs(server, "test-e", second);
    const snapshot = await server.getMatchState();
    expect(snapshot.match.phase).toBe("lobby");
    expect(snapshot.match.players).toEqual(["test-e"]);
    expect(snapshot.you.role).toBeNull();
  });

  test("gives the same lobby to a player who asks twice", async (server) => {
    server.connect({ account: "test-a" });
    const first = (await server.findMatch()).roomId;
    const again = (await server.findMatch()).roomId;
    expect(again).toBe(first);
    expect((await roomMatch(first)).players).toEqual(["test-a"]);
  });

  test("frees a lobby seat when a player leaves", async (server) => {
    server.connect({ account: "test-a" });
    const roomId = (await server.findMatch()).roomId;
    actAs(server, "test-a", roomId);
    await server.leaveMatch();
    expect((await roomMatch(roomId)).players).toEqual([]);
  });

  test("refuses the test clock for real accounts", async (server) => {
    const roomId = await fillRoom(server);
    server.connect({ account: "0xabc", roomId });
    expect(await errorOf(server.devAdvanceClock(1000))).toContain("unavailable");
  });

  test("refuses room calls from outside a match room", async (server) => {
    server.connect({ account: "test-a", roomId: "nowhere" });
    expect(await errorOf(server.getMatchState())).toContain("unavailable");
  });
});

describe("ending", () => {
  test("gives the traitor the win on timeout and records every player once", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    actAs(server, PLAYERS[0], roomId);
    await server.devAdvanceClock(EIGHT_MINUTES);
    await server.syncMatch();
    const snapshot = await server.getMatchState();
    expect(snapshot.match.phase).toBe("ended");
    expect(snapshot.match.result).toEqual({ winner: "traitor", reason: "timeout", traitor });
    expect(snapshot.match.results).toHaveLength(4);
    expect(snapshot.match.secretRef).toBeNull();
    expect(await $global.countCollectionItems("match_results")).toBe(4);
    expect((await $global.getUserState(traitor)).profile).toMatchObject({ games: 1, wins: 1, traitorGames: 1, traitorWins: 1 });
    const adventurer = PLAYERS.filter((p) => p !== traitor)[0];
    expect((await $global.getUserState(adventurer)).profile).toMatchObject({ games: 1, wins: 0, adventurerGames: 1 });
  });

  test("lets $roomTick end a match whose time is up", async (server) => {
    const roomId = await fillRoom(server);
    await server.$roomTick(500, roomId);
    expect((await roomMatch(roomId)).phase).toBe("playing");
    const match = await roomMatch(roomId);
    match.devClockOffsetMs = EIGHT_MINUTES;
    await $global.updateRoomState(roomId, { match });
    await server.$roomTick(500, roomId);
    const ended = await roomMatch(roomId);
    expect(ended.phase).toBe("ended");
    expect(ended.result.reason).toBe("timeout");
    expect(ended.results).toHaveLength(4);
  });

  test("counts players who leave mid-match as dead; no adventurer left means the traitor wins", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    for (const account of PLAYERS.filter((p) => p !== traitor)) {
      actAs(server, account, roomId);
      await server.leaveMatch();
    }
    const match = await roomMatch(roomId);
    expect(match.phase).toBe("ended");
    expect(match.result.reason).toBe("wiped");
    expect(match.dead).toHaveLength(3);
  });
});
```

- [ ] **Step 5: 실패 확인**

Run: `npm run server:test`
Expected: 빌드 실패 — `server/src/server.ts`가 없음.

- [ ] **Step 6: 서버 구현** — `server/src/server.ts`

```ts
import { MATCH_PLAYERS, PROTOCOL_VERSION } from "../../src/game/match/constants";
import { createLobby, joinLobby, leaveLobby, monsterSpawnsFor, startMatch } from "../../src/game/match/lifecycle";
import { markLeft, resolveOutcome, settleResults } from "../../src/game/match/outcome";
import { RuleViolation, type MatchEvent, type PublicMatch, type SecretMatch } from "../../src/game/match/types";
import { privateView, type PrivateView } from "../../src/game/match/view";
import { LEVEL_1, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";
import {
  createSecret, deleteSecret, listLobbies, newRoomId, readMatch, readSecret, saveResults,
  withMatchmakingLock, withRoomLock, writeMatch, writeSecret,
} from "./store";

const LEVEL = parseLevel(LEVEL_1, TILE_SIZE);
const SPAWNS = monsterSpawnsFor(LEVEL);

interface RoomContext {
  roomId: string;
  account: string;
  match: PublicMatch;
  secret: SecretMatch | null;
  now: number;
  events: MatchEvent[];
}

export interface MatchSnapshot {
  roomId: string;
  serverNow: number;
  match: PublicMatch;
  you: PrivateView;
}

function clock(match: PublicMatch): number {
  return Date.now() + match.devClockOffsetMs;
}

function currentRoom(): string {
  const roomId = $sender.roomId;
  if (typeof roomId !== "string" || roomId.length === 0) throw new RuleViolation("unavailable");
  return roomId;
}

function requireText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) throw new RuleViolation("unavailable");
  return value;
}

function requireLive(ctx: RoomContext): SecretMatch {
  if (ctx.match.phase !== "playing" || !ctx.secret) throw new RuleViolation("not_playing");
  return ctx.secret;
}

// Every in-room request: lock, load, apply rules, settle the clock, save, then notify.
async function inRoom<T>(work: (ctx: RoomContext) => T | Promise<T>): Promise<T> {
  const roomId = currentRoom();
  return withRoomLock(roomId, async () => {
    const match = await readMatch(roomId);
    if (!match) throw new RuleViolation("unavailable");
    const ctx: RoomContext = {
      roomId, account: $sender.account, match, secret: await readSecret(match), now: clock(match), events: [],
    };
    const value = await work(ctx);
    ctx.events.push(...resolveOutcome(ctx.match, ctx.secret, ctx.now));
    await commit(ctx);
    notify(ctx);
    return value;
  });
}

async function commit(ctx: RoomContext): Promise<void> {
  const { roomId, match, secret } = ctx;
  if (secret && match.phase === "ended" && match.secretRef) {
    const results = settleResults(match, secret);
    match.results = results;
    await saveResults(roomId, results);
    await deleteSecret(match);
    match.secretRef = null;
  } else if (secret) {
    await writeSecret(match, secret);
  }
  await writeMatch(roomId, match);
}

function notify(ctx: RoomContext): void {
  const { match, secret, events } = ctx;
  const privates = new Set<string>();
  for (const event of events) {
    switch (event.type) {
      case "private":
        privates.add(event.account);
        break;
      case "pain":
        for (const to of event.to) $room.sendMessageToUser("pain", to, { x: event.x, z: event.z });
        break;
      case "possession":
        $room.broadcastToRoom("possession", { monsterId: event.monsterId, active: event.active, endsAt: event.endsAt });
        break;
      case "ended":
        $room.broadcastToRoom("ended", { result: match.result, results: match.results });
        break;
    }
  }
  for (const account of privates) $room.sendMessageToUser("private", account, privateView(match, secret, account));
}

export class Server {
  async getServerVersion(): Promise<{ protocol: number }> {
    return { protocol: PROTOCOL_VERSION };
  }

  async findMatch(): Promise<{ roomId: string }> {
    const account = $sender.account;
    return withMatchmakingLock(async () => {
      const lobbies = await listLobbies();
      const target = lobbies.find((l) => l.match.players.includes(account))
        ?? lobbies.find((l) => l.match.players.length < MATCH_PLAYERS);
      const roomId = target?.roomId ?? newRoomId(Date.now());
      await $global.joinRoom(roomId);
      await withRoomLock(roomId, async () => {
        const match = (await readMatch(roomId)) ?? createLobby(Date.now());
        joinLobby(match, account);
        if (match.players.length === MATCH_PLAYERS) {
          match.secretRef = await createSecret(startMatch(match, clock(match), Math.random, SPAWNS));
        }
        await writeMatch(roomId, match);
      });
      return { roomId };
    });
  }

  async leaveMatch(): Promise<void> {
    await inRoom((ctx) => {
      if (ctx.match.phase === "lobby") leaveLobby(ctx.match, ctx.account);
      else ctx.events.push(...markLeft(ctx.match, ctx.secret, ctx.account, ctx.now));
    });
    await $global.leaveRoom();
  }

  async getMatchState(): Promise<MatchSnapshot> {
    return inRoom((ctx) => ({
      roomId: ctx.roomId,
      serverNow: ctx.now,
      match: ctx.match,
      you: privateView(ctx.match, ctx.secret, ctx.account),
    }));
  }

  async syncMatch(): Promise<void> {
    await inRoom(() => undefined);
  }

  async devAdvanceClock(ms: number): Promise<number> {
    if (!$sender.account.startsWith("test-") || typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
      throw new RuleViolation("unavailable");
    }
    return inRoom((ctx) => {
      ctx.match.devClockOffsetMs += ms;
      ctx.now += ms;
      return ctx.now;
    });
  }

  // Platform hook (every 200-1000 ms per active room). Only the deadline needs it:
  // everything else is settled by the next request. The cheap unlocked read keeps idle ticks light.
  async $roomTick(_deltaMillis: number, roomId: string): Promise<void> {
    const peek = await readMatch(roomId);
    if (!peek || peek.phase !== "playing" || peek.endsAt === null || clock(peek) < peek.endsAt) return;
    await withRoomLock(roomId, async () => {
      const match = await readMatch(roomId);
      if (!match) return;
      const ctx: RoomContext = { roomId, account: "", match, secret: await readSecret(match), now: clock(match), events: [] };
      ctx.events.push(...resolveOutcome(match, ctx.secret, ctx.now));
      // No $room outside a request: clients see the end through the room state.
      if (ctx.events.length > 0) await commit(ctx);
    });
  }
}
```

- [ ] **Step 7: 통과 확인**

Run: `npm run server:typecheck && npm run server:test`
Expected: 타입 에러 없음. 테스트 요약 `Total: 10 tests`, `Passed: 10 tests`.

실패하면: 테스트 러너 출력의 `❌` 줄 메시지로 원인을 찾는다. `Expected …, got …` 형식이다. 특히 `$global.getAllRoomStates()`가 `roomId`를 포함하지 않으면 `listLobbies`가 빈 목록을 돌려 다섯 번째 플레이어 테스트는 통과하지만 "같은 로비" 테스트가 실패한다 — 그 경우 `$global.getAllRoomIds()` + `$global.getRoomState(id)` 조합으로 바꾼다.

- [ ] **Step 8: 커밋**

```bash
git add package.json server/package.json server/package-lock.json server/tsconfig.json server/src server/test
git commit -m "feat: Verse8 server matchmaking, match state, ending and settlement"
```

---

### Task 7: 경기 중 행동 서버 함수

**Files:**
- Modify: `server/src/server.ts`
- Test: `server/test/actions.test.ts`

**Interfaces:**
- Consumes: Task 4·3 규칙 함수, Task 6의 `inRoom`, `requireLive`, `requireText`, `store.ts`의 `readPose`, `readPoses`, `writePose`, `isPose`
- Produces (클라이언트 호출 이름 — Plan 3이 사용):
  ```ts
  reportPose(pose: { x: number; z: number; yaw: number }): Promise<void>   // 잠금 없음. 클라이언트는 throttle 100ms, needResponse:false
  reportMonsters(updates: MonsterPoseUpdate[]): Promise<void>            // 최대 32개. 권한 없는 항목은 무시. throttle 150ms 권장
  possess(monsterId: string): Promise<PrivateView>
  release(): Promise<PrivateView>
  fireAtMonster(monsterId: string): Promise<void>
  fireAtPlayer(target: string): Promise<void>
  attackWithMonster(monsterId: string, target: string): Promise<void>
  escape(): Promise<void>
  ```
  서버 함수 이름은 규칙 함수(`shootMonster` 등)와 겹치지 않게 지었다.
  사거리·탈출 판정에 쓰는 위치는 **서버에 마지막으로 보고된 위치**다. 클라이언트는 행동 직전에 `reportPose`를 한 번 더 보내는 것이 좋다.

- [ ] **Step 1: 실패하는 테스트** — `server/test/actions.test.ts`

`LEVEL_1` 기준 위치: `zombie-0` (34, 14), `zombie-1` (14, 26), 탈출구 (38, 26).

```ts
import {
  PLAYERS, actAs, captureMessages, errorOf, fillRoom, findTraitor, placeAll, roomMatch,
} from "./helpers";

const MINUTE = 60_000;

describe("rule errors", () => {
  test("come back to the caller as their code", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const adventurer = PLAYERS.filter((p) => p !== traitor)[0];
    actAs(server, adventurer, roomId);
    expect(await errorOf(server.possess("zombie-0"))).toContain("not_traitor");
    expect(await errorOf(server.fireAtMonster(""))).toContain("unavailable");
    actAs(server, traitor, roomId);
    expect(await errorOf(server.possess("zombie-0"))).toContain("not_ready");
  });

  test("block match actions in the lobby", async (server) => {
    server.connect({ account: "test-a" });
    const roomId = (await server.findMatch()).roomId;
    actAs(server, "test-a", roomId);
    expect(await errorOf(server.fireAtMonster("zombie-0"))).toContain("not_playing");
    expect(await errorOf(server.escape())).toContain("not_playing");
  });
});

describe("reportPose", () => {
  test("stores a valid pose and rejects bad numbers", async (server) => {
    const roomId = await fillRoom(server);
    actAs(server, PLAYERS[0], roomId);
    await server.reportPose({ x: 3, z: 4, yaw: 1 });
    const stored = (await $global.getRoomUserState(roomId, PLAYERS[0])).pose;
    expect([stored.x, stored.z, stored.yaw]).toEqual([3, 4, 1]);
    expect(await errorOf(server.reportPose({ x: Number.NaN, z: 0, yaw: 0 }))).toContain("unavailable");
    expect(await errorOf(server.reportPose(null))).toContain("unavailable");
  });
});

describe("possession", () => {
  test("links damage to the body and screams only to nearby players", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const [shooter, near, far] = PLAYERS.filter((p) => p !== traitor);
    await placeAll(server, roomId, {
      [traitor]: { x: 30, z: 14 },
      [shooter]: { x: 34, z: 20 },
      [near]: { x: 28, z: 16 },
      [far]: { x: 6, z: 6 },
    });
    actAs(server, traitor, roomId);
    await server.devAdvanceClock(MINUTE);

    const messages = captureMessages();
    try {
      const view = await server.possess("zombie-0");
      expect(view.possession.monsterId).toBe("zombie-0");
      actAs(server, shooter, roomId);
      await server.fireAtMonster("zombie-0");
    } finally {
      messages.restore();
    }

    const possession = messages.sent.filter((m) => m.type === "possession");
    expect(possession).toHaveLength(1);
    expect(possession[0].message.monsterId).toBe("zombie-0");
    expect(possession[0].message.active).toBe(true);
    expect(messages.sent.filter((m) => m.type === "pain").map((m) => m.account).sort()).toEqual([near, shooter].sort());
    const privates = messages.sent.filter((m) => m.type === "private");
    expect(privates.length > 0 && privates.every((m) => m.account === traitor)).toBe(true);

    actAs(server, traitor, roomId);
    const you = (await server.getMatchState()).you;
    expect(you.hp).toBe(86);
    expect(you.possession.monsterId).toBe("zombie-0");
    expect((await roomMatch(roomId)).monsters["zombie-0"].hp).toBe(66);
  });

  test("shooting the frozen body frees the monster and stuns it", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const shooter = PLAYERS.filter((p) => p !== traitor)[0];
    await placeAll(server, roomId, { [traitor]: { x: 30, z: 14 }, [shooter]: { x: 30, z: 20 } });
    actAs(server, traitor, roomId);
    await server.devAdvanceClock(MINUTE);
    await server.possess("zombie-0");

    actAs(server, shooter, roomId);
    await server.fireAtPlayer(traitor);

    actAs(server, traitor, roomId);
    const you = (await server.getMatchState()).you;
    expect(you.possession).toBeNull();
    expect(you.hp).toBe(66);
    const zombie = (await roomMatch(roomId)).monsters["zombie-0"];
    expect(zombie.possessed).toBe(false);
    expect(zombie.stunnedUntil > 0).toBe(true);
  });

  test("the traitor can let go early", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    await placeAll(server, roomId, { [traitor]: { x: 30, z: 14 } });
    actAs(server, traitor, roomId);
    await server.devAdvanceClock(MINUTE);
    await server.possess("zombie-0");
    const view = await server.release();
    expect(view.possession).toBeNull();
    expect((await roomMatch(roomId)).monsters["zombie-0"].possessed).toBe(false);
  });
});

describe("monsters", () => {
  test("only the host moves unpossessed monsters, and the host's monster can attack", async (server) => {
    const roomId = await fillRoom(server);
    const [host, target, other] = PLAYERS;
    await placeAll(server, roomId, { [target]: { x: 34, z: 15 } });

    actAs(server, other, roomId);
    await server.reportMonsters([{ id: "zombie-0", x: 1, z: 1, yaw: 0 }]);
    let zombie = (await roomMatch(roomId)).monsters["zombie-0"];
    expect([zombie.x, zombie.z]).toEqual([34, 14]);

    actAs(server, host, roomId);
    await server.reportMonsters([{ id: "zombie-0", x: 34, z: 14.5, yaw: 1 }]);
    zombie = (await roomMatch(roomId)).monsters["zombie-0"];
    expect([zombie.x, zombie.z, zombie.yaw]).toEqual([34, 14.5, 1]);

    await server.attackWithMonster("zombie-0", target);
    actAs(server, target, roomId);
    expect((await server.getMatchState()).you.hp).toBe(80);

    actAs(server, other, roomId);
    expect(await errorOf(server.attackWithMonster("zombie-0", target))).toContain("not_authority");
    expect(await errorOf(server.reportMonsters("nope"))).toContain("unavailable");
  });

  test("an adventurer can kill a monster", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const shooter = PLAYERS.filter((p) => p !== traitor)[0];
    await placeAll(server, roomId, { [shooter]: { x: 34, z: 20 } });
    actAs(server, shooter, roomId);
    for (let i = 0; i < 3; i++) {
      await server.fireAtMonster("zombie-0");
      await server.devAdvanceClock(100);
    }
    const zombie = (await roomMatch(roomId)).monsters["zombie-0"];
    expect(zombie.alive).toBe(false);
    expect(await errorOf(server.fireAtMonster("zombie-0"))).toContain("monster_dead");
  });
});

describe("escape", () => {
  test("needs the exit", async (server) => {
    const roomId = await fillRoom(server);
    await placeAll(server, roomId, { [PLAYERS[0]]: { x: 2, z: 2 } });
    actAs(server, PLAYERS[0], roomId);
    expect(await errorOf(server.escape())).toContain("not_at_exit");
  });

  test("adventurers win when every living adventurer is out, and everyone is told", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const adventurers = PLAYERS.filter((p) => p !== traitor);
    const spots: Record<string, { x: number; z: number }> = {};
    for (const a of adventurers) spots[a] = { x: 38, z: 26 };
    await placeAll(server, roomId, spots);

    const messages = captureMessages();
    try {
      for (const a of adventurers) {
        actAs(server, a, roomId);
        await server.escape();
      }
    } finally {
      messages.restore();
    }

    const match = await roomMatch(roomId);
    expect(match.result).toEqual({ winner: "adventurers", reason: "escaped", traitor });
    expect(match.escaped).toEqual(adventurers);
    const ended = messages.sent.filter((m) => m.type === "ended");
    expect(ended).toHaveLength(1);
    expect(ended[0].message.results).toHaveLength(4);
    expect((await $global.getUserState(adventurers[0])).profile).toMatchObject({ games: 1, wins: 1, escapes: 1 });
    expect((await $global.getUserState(traitor)).profile).toMatchObject({ games: 1, wins: 0, traitorGames: 1 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run server:test`
Expected: `actions.test.ts`의 테스트 대부분 FAIL — `server.possess is not a function` 등. `match.test.ts` 10개는 계속 PASS.

- [ ] **Step 3: 구현** — `server/src/server.ts`

import 두 줄을 추가/교체:
```ts
import {
  applyMonsterPoses, monsterAttack, reachExit, shootMonster, shootPlayer, type MonsterPoseUpdate,
} from "../../src/game/match/damage";
import { releasePossession, startPossession } from "../../src/game/match/possession";
```
`./store` import 목록에 `isPose, readPose, readPoses, writePose`를 추가한다.

`class Server` 안, `$roomTick` 위에 추가:
```ts
  async reportPose(pose: unknown): Promise<void> {
    const roomId = currentRoom();
    if (!isPose(pose)) throw new RuleViolation("unavailable");
    await writePose(roomId, $sender.account, pose, Date.now());
  }

  async reportMonsters(updates: unknown): Promise<void> {
    if (!Array.isArray(updates) || updates.length > 32) throw new RuleViolation("unavailable");
    const valid = updates.filter((u): u is MonsterPoseUpdate => isPose(u) && typeof (u as { id?: unknown }).id === "string");
    await inRoom((ctx) => {
      const secret = requireLive(ctx);
      ctx.events.push(...applyMonsterPoses(ctx.match, secret, ctx.account, valid, ctx.now));
    });
  }

  async possess(monsterId: unknown): Promise<PrivateView> {
    const id = requireText(monsterId);
    return inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const body = await readPose(ctx.roomId, ctx.account);
      ctx.events.push(...startPossession(ctx.match, secret, ctx.account, id, body, ctx.now));
      return privateView(ctx.match, secret, ctx.account);
    });
  }

  async release(): Promise<PrivateView> {
    return inRoom((ctx) => {
      const secret = requireLive(ctx);
      ctx.events.push(...releasePossession(ctx.match, secret, ctx.account, ctx.now));
      return privateView(ctx.match, secret, ctx.account);
    });
  }

  async fireAtMonster(monsterId: unknown): Promise<void> {
    const id = requireText(monsterId);
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const poses = await readPoses(ctx.roomId, ctx.match.players);
      ctx.events.push(...shootMonster(ctx.match, secret, ctx.account, id, poses[ctx.account] ?? null, poses, ctx.now));
    });
  }

  async fireAtPlayer(target: unknown): Promise<void> {
    const who = requireText(target);
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const from = await readPose(ctx.roomId, ctx.account);
      const to = await readPose(ctx.roomId, who);
      ctx.events.push(...shootPlayer(ctx.match, secret, ctx.account, who, from, to, ctx.now));
    });
  }

  async attackWithMonster(monsterId: unknown, target: unknown): Promise<void> {
    const id = requireText(monsterId);
    const who = requireText(target);
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const to = await readPose(ctx.roomId, who);
      ctx.events.push(...monsterAttack(ctx.match, secret, ctx.account, id, who, to, ctx.now));
    });
  }

  async escape(): Promise<void> {
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const pose = await readPose(ctx.roomId, ctx.account);
      ctx.events.push(...reachExit(ctx.match, secret, ctx.account, pose, LEVEL.exits, ctx.now));
    });
  }
```

`isPose`는 `x`, `z`, `yaw` 세 숫자만 보므로 `reportMonsters`의 항목 검사에도 그대로 쓴다.

- [ ] **Step 4: 통과 확인**

Run: `npm run server:typecheck && npm run server:test`
Expected: 타입 에러 없음. `Total: 20 tests`, `Passed: 20 tests` (match 10 + actions 10).

- [ ] **Step 5: 커밋**

```bash
git add server/src/server.ts server/test/actions.test.ts
git commit -m "feat: server match actions for possession, shooting, monsters and escape"
```

---

### Task 8: 문서 정리와 전체 확인

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-traitor-hunt-design.md`
- Modify: `README.md`

- [ ] **Step 1: 기획서 갱신** — `docs/superpowers/specs/2026-09-17-traitor-hunt-design.md`

"## 5. 미결정 사항" 섹션 제목과 본문을 아래로 교체:

```markdown
## 5. 확정된 규칙 (2026-09-17)

- 모험가 승리: 배신자를 뺀 살아 있는 모험가 전원이 탈출. 모험가가 모두 죽거나 시간(8분)이 끝나면 배신자 승.
- 체력: 모두 100. 경기 중 나가면 사망 처리.
- 빙의: 시작 60초 후부터, 지속 8초, 끝난 뒤 45초 쿨다운, 12m 이내 몬스터.
- 연결 대미지: 받은 피해의 40%, 빙의 몬스터가 죽으면 본체에 추가 35. 비명은 본체 반경 10m 안의 다른 플레이어에게만.
- 빙의 중 본체가 총에 맞으면 빙의 해제 + 몬스터 2초 기절. 아군 사격 허용.
- 정체 숨기기는 단순 방식(보관 위치만 예측 어렵게). 기술적으로 뜯어보는 플레이어는 알아낼 수 있음을 감수.
- 투표/신고 시스템은 여전히 범위 밖.
- 수치는 전부 `src/game/match/constants.ts`에 있고 플레이테스트로 조정한다.
```

같은 파일 "## 10. 다음 단계" 섹션을 아래로 교체:

```markdown
## 10. 장기 성장 구조 (2026-09-17 결정)

한 판으로 끝나지 않게 세 가지를 넣는다. 서버는 판마다 사람별 결과(`match_results` 컬렉션)와 누적 전적(사용자 상태 `profile`)을 남기고, 세 기능은 이 기록을 읽어 계산한다.

- 계정 레벨·해금: 판마다 경험치, 레벨에 따라 무기·외형·맵·몬스터 해금
- 미션·업적: 일일/주간 미션과 업적 (예: 배신자에게 피해 주기, 빙의 성공)
- 랭킹·시즌: 모험가·배신자 역할별 점수와 순위, 기간제 시즌과 보상

각 기능의 수치·목록은 해당 구현 계획 전에 따로 설계한다. 전체 순서는 Plan 2 문서의 로드맵을 따른다.
```

- [ ] **Step 2: README 갱신** — `README.md`

"## 현재 상태" 섹션 본문을 교체:
```markdown
Plan 1 완료: 혼자 던전 방을 1인칭으로 걸어다니며 AKM으로 좀비를 쏠 수 있다.
Plan 2 완료: 서버가 4인 매치 규칙(방 찾기, 배신자 배정, 빙의, 연결 대미지, 사격, 탈출, 승패)과 판 결과 기록을 처리한다. 화면 연결은 Plan 3.
```

"## 실행" 섹션 끝에 추가:
````markdown
서버(Verse8 GameServer, `server/`):

```bash
npm run server:install
npm run server:test
```
````

- [ ] **Step 3: 전체 확인**

Run:
```bash
npm test
npm run typecheck
npm run build
npm run server:typecheck
npm run server:test
npm run server:build
```
Expected: vitest 95 PASS, 타입 에러 없음, 빌드 성공, 서버 테스트 20 PASS, `server/dist/server.js` 생성.

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-09-17-traitor-hunt-design.md README.md
git commit -m "docs: record settled match rules and the long-term progression plan"
```

---

## 완료 기준 (Plan 2)

- 순수 규칙 테스트 95개(기존 30 + 65) 통과, 서버 통합 테스트 20개 통과
- 서버 빌드 산출물 `server/dist/server.js` 생성
- 판이 끝나면 `match_results`에 사람 수만큼 문서가 생기고 각 계정 `profile`이 갱신됨 (테스트로 확인)
- 방 상태(`match`)에 배신자 계정·체력·빙의 주체가 들어가지 않음 (테스트로 확인)

## 알려진 위험 (다음 계획에서 다룸)

- 서버 호출마다 방 잠금을 잡는다. 호스트의 몬스터 위치 보고(150ms)와 각자의 `syncMatch`(1초)가 겹치면 초당 호출이 많다. Plan 6에서 실서버 부하를 측정한다. 참고: Verse8에서 `$lock` 관련 OOM 오류가 나면 게임 코드가 아니라 플랫폼 Redis 고갈일 수 있다.
- 빙의 중 본체 위치 보고를 서버가 막지 않는다(비밀 정보 조회 비용 때문). 클라이언트가 보내지 않는 것으로 처리하고, 치팅 방지는 이후 과제.
- `$roomTick`은 로컬 도구에 없어서 테스트에서 직접 호출로만 검증했다. 실서버 호출 여부는 Plan 6 배포 때 확인한다.
