# Traitor Hunt — Plan 4: Co-op Objectives, Plate Votes and Human-like Bots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Work directly on `master` (solo project — no feature branches).

**Goal:** 한 판을 20분짜리 협동 모험으로 만든다. 룬 조각 → 고대 장치 → 봉인 해제(몬스터 물결) → 보스 → 탈출 단계를 넣고, 배신자는 총이 아니라 "몸으로 투표"(룬 발판)로 찾아낸다. 연습 모드 봇은 목표를 수행하고 투표에 참여하며, 사람처럼 서툴게 움직인다.

**Architecture:**
- 새 맵 `RUINS`(25×13칸)가 목표 지점(룬 조각·장치·제단·물결 지점·보스·발판·문 3개)을 글자로 담는다. 닫힌 문은 `solidWith(layout, openGates)`로 벽처럼 막는다.
- 규칙은 계속 순수 함수다. `objectives.ts`(단계 진행·상호작용·물결·보스), `vote.ts`(발판 집계·지목 판정)가 공개 방 상태(`match.objectives`, `match.vote`, `match.bound`, `match.revealed`)를 바꾼다.
- 서버는 `interact`·`devSetStage`를 더하고, `$roomTick`이 경기 중 매 틱 위치를 읽어 투표·봉인 진행·시간 종료를 판정한다(변화가 있을 때만 저장).
- 몬스터는 종류별 수치(`MONSTER_STATS`)를 쓴다. 보스는 빙의할 수 없다.
- 봇(`BotBrain`)은 단계별 목표를 따라가고, 비명·발판 신호로 투표하며, 반응 지연·조준 오차·회전 속도·경로 흔들림·멈춤으로 사람처럼 보인다.
- 화면은 문·룬 조각·장치·제단·발판(이름표)·보스를 그리고, HUD에 목표·상호작용·투표·묶임 상태를 보여 준다.

**Tech Stack:** TypeScript, React 18, three 0.185, vitest 3, `@agent8/gameserver-node` 0.1.13(서버 테스트).

## 로드맵 (2026-09-17 갱신)

| 계획 | 내용 |
|---|---|
| Plan 1·2·3 | 싱글 FPS 기반, 서버 규칙, 멀티플레이 화면·연습 모드 (Plan 3 작업 9 = Verse8 실서버 연결은 사용자 프로젝트 정보 대기) |
| **Plan 4 (이 문서)** | 협동 목표 5단계, 몸으로 투표, 사람 같은 봇, 판 20분 |
| Plan 5 | 계정 레벨·해금 + 미션·업적 |
| Plan 6 | 랭킹·시즌 |
| Plan 7 | 플레이어 캐릭터 에셋·코스튬 구조, 1인칭 손·효과음·연출, 모바일 조작, 성능·부하, Verse8 배포 |
| Plan 8 | 온라인 빈자리 봇 채우기(서버가 봇을 움직임, 봇은 배신자 불가) |

## 이번 계획에서 하지 않는 것

- 플레이어 캐릭터 에셋 교체·코스튬(Plan 7). 다른 플레이어는 계속 임시 마네킹이다.
- 보스 전용 모델. 보스는 좀비 모델을 크게 키우고 붉게 물들여 쓴다.
- 온라인 빈자리 봇(Plan 8), Verse8 실서버 연결 검증(Plan 3 작업 9).
- 음성·채팅. 투표 신호는 몸(발판 위치)으로만 주고받는다.

## Global Constraints

- `master`에서 바로 작업·커밋하고, 작업이 끝날 때마다 `git push origin master`.
- 사람끼리 쏘는 기능은 없다. 총은 몬스터에게만 맞는다. 배신자가 사람에게 피해를 주는 길은 빙의한 몬스터뿐이다.
- 봇은 연습 모드에서만 쓴다(이 계획 기준).
- 규칙 함수는 받은 상태를 직접 바꾸고, 서버 요청은 잠금 → 읽기 → 규칙 → `advanceObjectives` → `resolveOutcome` → 저장 → 알림 순서를 지킨다.
- 로컬 서버 테스트 러너에서 `.not`을 쓰지 않는다(무한 재귀). 불리언으로 비교한다.
- 수치는 전부 `src/game/match/constants.ts`에 두고 플레이테스트로 조정한다.
- 비밀값(토큰)을 `.env`·`.agent8.lock`에 넣지 않는다. 변환한 모델 파일(`*.glb`)은 커밋하지 않는다.
- 사용자에게 하는 보고는 쉬운 한국어 완전한 문장으로.

## File Structure

| 파일 | 할 일 |
|---|---|
| `src/game/rules/levelLayout.ts` | `RUINS` 맵, 목표 지점 필드, `solidWith` |
| `src/game/rules/pathfinding.ts` | `findPath`가 막힘 판정 함수를 받는다 |
| `src/game/match/constants.ts` | 판 20분, 프로토콜 2, 몬스터 종류별 수치, 목표·투표 수치 |
| `src/game/match/types.ts` | `MonsterKind`, `Stage`, `ObjectiveState`, `VoteState`, 새 오류 코드 |
| `src/game/match/lifecycle.ts` | 목표·투표 초기 상태, `newMonster`, `isBound` |
| `src/game/match/possession.ts` | 보스·공개된 배신자 빙의 금지 |
| `src/game/match/damage.ts` | 종류별 공격 수치, 묶임·출구 잠금 검사 |
| `src/game/match/monsterAi.ts` | 종류별 속도·추적 거리 |
| `src/game/match/objectives.ts` (새) | 단계 진행, 상호작용, 물결, 보스, 개발용 단계 건너뛰기 |
| `src/game/match/vote.ts` (새) | 발판 집계, 지목 판정 |
| `server/src/server.ts` | `interact`, `devSetStage`, 새 `$roomTick`, `RUINS` |
| `src/net/matchClient.ts` | `interact`, `setStage`, 빙의 끊김 재동기화 |
| `src/net/hostDirector.ts` | 닫힌 문을 막힘으로 |
| `src/game/bots/botBrain.ts` | 목표·투표·사람 같은 움직임 (전면 교체) |
| `src/game/render/names.ts` (새) | 계정 → 화면 이름 |
| `src/game/render/ObjectiveProps.ts` (새) | 문·조각·장치·제단·발판 그리기 |
| `src/game/render/MonsterActor.ts` | 크기·색 옵션(보스) |
| `src/game/render/RemotePlayerActor.ts` | 공개·묶임 표시 |
| `src/game/render/MatchView.ts` | 새 맵, 동적 막힘, 새 조작, HUD 상태, 디버그 핸들 |
| `src/ui/Hud.tsx`, `src/index.css` | 목표·상호작용·투표·묶임 표시 |
| `src/App.tsx` | `RUINS` 사용 |
| 테스트 | `tests/rules/ruins.test.ts`, `tests/match/objectives.test.ts`, `tests/match/vote.test.ts`, `server/test/objectives.test.ts` 새로; 기존 테스트 일부 수정 |

좌표 참고 (`RUINS`, 칸 중심 = (열+0.5)×4, (행+0.5)×4):

| 지점 | 칸 (열,행) | 월드 (x,z) |
|---|---|---|
| 시작 `P` | (1,1) | (6,6) |
| 좀비 `Z` | (8,3), (17,3), (13,5) | (34,14), (70,14), (54,22) |
| 룬 조각 `S` | (9,1), (1,7) | (38,6), (6,30) |
| 발판 `R` | (2,2), (4,2), (2,4), (4,4) | (10,10), (18,10), (10,18), (18,18) |
| 문 `1`·`2`·`3` | (10,4), (16,5), (16,10) | (42,18), (66,22), (66,42) |
| 장치 `D` | (12,2), (22,2) | (50,10), (90,10) |
| 제단 `A` | (20,8) | (82,34) |
| 물결 `W` | (18,6), (22,6), (18,10), (22,10) | (74,26), (90,26), (74,42), (90,42) |
| 보스 `K` | (13,9) | (54,38) |
| 출구 `E` | (13,11) | (54,46) |

---

### Task 1: 유적 맵, 문, 막힘 판정

**Files:**
- Modify: `src/game/rules/levelLayout.ts`
- Modify: `src/game/rules/pathfinding.ts`
- Create: `tests/rules/ruins.test.ts`

**Interfaces:**
- Produces: `RUINS: string[]`; `LevelLayout`에 `shards: Point2[]`, `devices: Point2[]`, `altar: Point2 | null`, `waveSpawns: Point2[]`, `bossSpawn: Point2 | null`, `plates: Point2[]`, `gates: Gate[]` (`Gate = { n: number; x: number; z: number }`, `n` 오름차순); `solidWith(layout, openGates: readonly number[]): SolidTest`; `findPath(layout, from, to, isSolid?: SolidTest)`.

- [ ] **Step 1: 실패하는 테스트**

`tests/rules/ruins.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RUINS, TILE_SIZE, parseLevel, solidWith } from "../../src/game/rules/levelLayout";
import { findPath } from "../../src/game/rules/pathfinding";

const level = parseLevel(RUINS, TILE_SIZE);

describe("RUINS", () => {
  it("has every objective spot", () => {
    expect([level.cols, level.rows]).toEqual([25, 13]);
    expect(level.playerSpawn).toEqual({ x: 6, z: 6 });
    expect(level.zombieSpawns[0]).toEqual({ x: 34, z: 14 });
    expect(level.shards).toEqual([{ x: 38, z: 6 }, { x: 6, z: 30 }]);
    expect(level.devices).toEqual([{ x: 50, z: 10 }, { x: 90, z: 10 }]);
    expect(level.altar).toEqual({ x: 82, z: 34 });
    expect(level.waveSpawns).toHaveLength(4);
    expect(level.bossSpawn).toEqual({ x: 54, z: 38 });
    expect(level.plates).toEqual([{ x: 10, z: 10 }, { x: 18, z: 10 }, { x: 10, z: 18 }, { x: 18, z: 18 }]);
    expect(level.gates).toEqual([{ n: 1, x: 42, z: 18 }, { n: 2, x: 66, z: 22 }, { n: 3, x: 66, z: 42 }]);
    expect(level.exits).toEqual([{ x: 54, z: 46 }]);
  });

  it("treats closed gates as walls and open ones as floor", () => {
    expect(solidWith(level, [])(42, 18)).toBe(true);
    expect(solidWith(level, [1])(42, 18)).toBe(false);
    expect(solidWith(level, [1])(40, 18)).toBe(false);
    expect(solidWith(level, [1, 2, 3])(1, 1)).toBe(true);
  });

  it("opens one zone per gate", () => {
    const reach = (open: number[], to: { x: number; z: number }) => findPath(level, level.playerSpawn, to, solidWith(level, open)) !== null;
    for (const s of level.shards) expect(reach([], s)).toBe(true);
    for (const p of level.plates) expect(reach([], p)).toBe(true);
    expect(reach([], level.devices[0])).toBe(false);
    expect(reach([1], level.devices[1])).toBe(true);
    expect(reach([1], level.altar!)).toBe(false);
    expect(reach([1, 2], level.altar!)).toBe(true);
    expect(reach([1, 2], level.exits[0])).toBe(false);
    expect(reach([1, 2, 3], level.exits[0])).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/rules/ruins.test.ts`
Expected: FAIL — `RUINS`·`solidWith` 없음.

- [ ] **Step 3: 맵과 파서**

`src/game/rules/levelLayout.ts` 머리(import·인터페이스)를 바꾼다:

```ts
import type { SolidTest } from "./movement";

export interface Placement { model: string; x: number; y: number; z: number; rotationY: number }
export interface Point2 { x: number; z: number }
export interface Gate { n: number; x: number; z: number }
export interface LevelLayout {
  tileSize: number;
  cols: number;
  rows: number;
  solid: boolean[][];
  placements: Placement[];
  playerSpawn: Point2;
  zombieSpawns: Point2[];
  exits: Point2[];
  shards: Point2[];
  devices: Point2[];
  altar: Point2 | null;
  waveSpawns: Point2[];
  bossSpawn: Point2 | null;
  plates: Point2[];
  gates: Gate[];
}
```

`LEVEL_1` 아래에 새 맵을 더하고 기호 집합을 넓힌다:

```ts
// Plan 4 map. S rune shard, R vote plate, 1-3 gates, D device, A altar, W wave spawn, K boss.
export const RUINS: string[] = [
  "#########################",
  "#P.......S#.............#",
  "#.R.R.....T.D.........D.#",
  "#.......Z.#......Z......#",
  "#.R.R.....1.....#########",
  "#B........#..Z..2.......#",
  "###.#######.....#.W...W.#",
  "#S..#######T###T#.......#",
  "#...########...#T...A...#",
  "############.K..#.......#",
  "###########.....3.W...W.#",
  "###########..E..#......C#",
  "#########################",
];

const PROP: Record<string, string> = { B: "dd_barrel", C: "chest_closed" };
const GATE_SYMBOLS = new Set(["1", "2", "3"]);
const FLOOR_SYMBOLS = new Set([".", "P", "Z", "B", "C", "E", "S", "D", "A", "W", "K", "R", ...GATE_SYMBOLS]);
const SOLID_SYMBOLS = new Set(["#", "T"]);
```

(기존 `PROP`·`FLOOR_SYMBOLS`·`SOLID_SYMBOLS` 선언은 위 것으로 바꾼다.)

`parseLevel` 안에서 `exits` 선언 아래에 모음을 더한다:

```ts
  const shards: Point2[] = [];
  const devices: Point2[] = [];
  const waveSpawns: Point2[] = [];
  const plates: Point2[] = [];
  const gates: Gate[] = [];
  // Asserted so TS keeps the wide types; they are assigned inside the callbacks below.
  let altar = null as Point2 | null;
  let bossSpawn = null as Point2 | null;
```

`if (ch === "E") exits.push({ x, z });` 아래에 더한다:

```ts
      if (ch === "S") shards.push({ x, z });
      if (ch === "D") devices.push({ x, z });
      if (ch === "A") altar = { x, z };
      if (ch === "W") waveSpawns.push({ x, z });
      if (ch === "K") bossSpawn = { x, z };
      if (ch === "R") plates.push({ x, z });
      if (GATE_SYMBOLS.has(ch)) gates.push({ n: Number(ch), x, z });
```

반환문을 바꾼다:

```ts
  gates.sort((a, b) => a.n - b.n);
  return {
    tileSize, cols, rows: rows.length, solid, placements, playerSpawn, zombieSpawns, exits,
    shards, devices, altar, waveSpawns, bossSpawn, plates, gates,
  };
```

`solidAt` 아래에 더한다:

```ts
// Gate cells are floor in the layout; a closed gate blocks its whole cell like a wall.
export function solidWith(layout: LevelLayout, openGates: readonly number[]): SolidTest {
  const half = layout.tileSize / 2;
  const closed = layout.gates.filter((g) => !openGates.includes(g.n));
  return (x, z) =>
    solidAt(layout, x, z)
    || closed.some((g) => x >= g.x - half && x < g.x + half && z >= g.z - half && z < g.z + half);
}
```

- [ ] **Step 4: 길찾기가 막힘 판정을 받게**

`src/game/rules/pathfinding.ts`:

```ts
import { solidAt, type LevelLayout, type Point2 } from "./levelLayout";
import type { SolidTest } from "./movement";
```

```ts
export function findPath(
  layout: LevelLayout, from: Point2, to: Point2,
  isSolid: SolidTest = (x, z) => solidAt(layout, x, z),
): Point2[] | null {
  const start = cellOf(layout, from);
  const goal = cellOf(layout, to);
  const walkable = (c: Cell) => {
    const p = cellCenter(layout, c);
    return !isSolid(p.x, p.z);
  };
```

(나머지 본문은 그대로.)

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/rules`
Expected: PASS (새 3개 + 기존 길찾기 5개).

- [ ] **Step 6: 커밋**

```bash
git add src/game/rules tests/rules
git commit -m "feat: ruins map with objective spots and gates that block while closed"
git push origin master
```

---

### Task 2: 매치 상태 확장 (몬스터 종류, 목표·투표 상태, 새 규칙 검사)

**Files:**
- Modify: `src/game/match/constants.ts`, `types.ts`, `lifecycle.ts`, `possession.ts`, `damage.ts`, `monsterAi.ts`
- Modify: `tests/match/lifecycle.test.ts`, `tests/match/damage.test.ts`, `tests/match/possession.test.ts`, `tests/match/monsterAi.test.ts`

**Interfaces:**
- Produces:
  - `MONSTER_STATS: Record<MonsterKind, { hp; damage; range; intervalMs; speed; aggro }>`
  - 목표·투표 상수: `SHARD_COUNT`, `DEVICE_COUNT`, `INTERACT_RANGE`, `DEVICE_ACTIVE_MS`, `SEAL_DURATION_MS`, `SEAL_RADIUS`, `SEAL_TICK_CAP_MS`, `SEAL_WAVE_AT_MS`, `WAVE_SIZE`, `PLATE_RADIUS`, `PLATE_HOLD_MS`, `PLATE_LOCK_MS`, `BIND_MS`
  - `MATCH_DURATION_MS = 20 * 60_000`, `PROTOCOL_VERSION = 2`
  - 타입: `MonsterKind = "zombie" | "boss"`, `Stage`, `STAGES`, `SealState`, `ObjectiveState`, `VoteRecord`, `VoteState`
  - `PublicMatch`에 `objectives`, `bound: Record<string, number>`, `revealed: string | null`, `vote`
  - 오류 코드 `nothing_here`, `need_shards`, `exit_locked`, `sealed`, `bound`
  - `createObjectives()`, `createVote()`, `newMonster(kind, x, z)`, `isBound(match, account, now)`
  - `reachExit`: 위치 검사 뒤 `stage !== "exit"`이면 `exit_locked`. 사격·탈출은 묶이면 `bound`.
  - `startPossession`: 공개된 배신자 `sealed`, 보스 `unavailable`.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/match/lifecycle.test.ts` 맨 아래에 더한다(`createObjectives`, `isBound`, `newMonster`를 lifecycle import에, `MONSTER_STATS`를 constants import에 더한다):

```ts
describe("plan 4 state", () => {
  it("starts with the first stage, no votes and nobody bound", () => {
    const match = fullLobby();
    startMatch(match, 1000, () => 0, SPAWNS);
    expect(match.objectives).toEqual(createObjectives());
    expect(match.objectives).toEqual({
      stage: "shards", shards: [false, false], devices: [0, 0], gates: [],
      seal: { progressMs: 0, lastAt: null, waves: 0 },
    });
    expect(match.vote).toEqual({ plate: null, since: 0, lockedUntil: 0, last: null });
    expect(match.bound).toEqual({});
    expect(match.revealed).toBeNull();
  });

  it("makes monsters from their kind's numbers and knows who is bound", () => {
    expect(newMonster("boss", 3, 4)).toMatchObject({ kind: "boss", x: 3, z: 4, hp: MONSTER_STATS.boss.hp, alive: true });
    const match = fullLobby();
    match.bound.a = 5000;
    expect(isBound(match, "a", 4999)).toBe(true);
    expect(isBound(match, "a", 5000)).toBe(false);
    expect(isBound(match, "b", 0)).toBe(false);
  });
});
```

`tests/match/damage.test.ts`:
- `describe("reachExit"` 안의 두 테스트 맨 앞(각 `playing()`/`possessing()` 다음 줄)에 `match.objectives.stage = "exit";`를 넣는다.
- `describe("reachExit"` 안에 더한다:

```ts
  it("keeps the exit shut until the last stage, and bound players inside", () => {
    const { match, secret, poses } = playing();
    expect(() => reachExit(match, secret, "b", poses.b, exits, T)).toThrow("not_at_exit");
    expect(() => reachExit(match, secret, "a", poses.a, exits, T)).toThrow("exit_locked");
    match.objectives.stage = "exit";
    match.bound.a = T + 1;
    expect(() => reachExit(match, secret, "a", poses.a, exits, T)).toThrow("bound");
    expect(match.escaped).toEqual([]);
  });
```

- `describe("monsterAttack"` 안에 더한다(`newMonster`를 lifecycle import에, `MONSTER_STATS`를 constants import에 더한다):

```ts
  it("uses the boss's own reach and damage", () => {
    const { match, secret } = playing();
    match.monsters.boss = newMonster("boss", 10, 12.5);
    monsterAttack(match, secret, "a", "boss", "b", at(10, 14), T);
    expect(secret.hp.b).toBe(100 - MONSTER_STATS.boss.damage);
    expect(match.monsters.boss.attackReadyAt).toBe(T + MONSTER_STATS.boss.intervalMs);
  });
```

- `describe("shootMonster"`(첫 사격 테스트가 있는 describe) 안에 더한다:

```ts
  it("does not let a bound player shoot", () => {
    const { match, secret, poses } = playing();
    match.bound.a = T + 1;
    expect(() => shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T)).toThrow("bound");
  });
```

`tests/match/possession.test.ts` 맨 아래에 더한다(`newMonster`를 lifecycle import에 더한다. 이 파일의 `playing()`은 배신자 `c`와 (10,10)의 `zombie-0`을 만들고, `NEAR`는 (5,10), `READY`는 첫 빙의 가능 시각이다):

```ts
describe("plan 4 limits", () => {
  it("refuses the boss and a traitor whose identity is out", () => {
    const { match, secret } = playing();
    match.monsters.boss = newMonster("boss", 6, 10);
    expect(() => startPossession(match, secret, "c", "boss", NEAR, READY)).toThrow("unavailable");
    match.revealed = "c";
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY)).toThrow("sealed");
  });
});
```

`tests/match/monsterAi.test.ts` 맨 아래에 더한다(`newMonster`를 lifecycle import에, `MONSTER_STATS`를 constants import에 더한다):

```ts
describe("monster kinds", () => {
  it("moves the boss at its own speed and chases from farther away", () => {
    const match = playing();
    delete match.monsters["zombie-0"];
    match.monsters.boss = newMonster("boss", 10, 10);
    const poses: Poses = { a: at(10, 10 + MONSTER_STATS.boss.aggro - 1), b: null, c: null, d: null };
    const step = stepMonsterAi(match, poses, open, 0.1, 0, never);
    expect(step.updates[0].z).toBeCloseTo(10 + MONSTER_STATS.boss.speed * 0.1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/match`
Expected: FAIL — 새 필드·함수 없음.

- [ ] **Step 3: 상수**

`src/game/match/constants.ts` 전체를 바꾼다:

```ts
export const PROTOCOL_VERSION = 2;
export const MATCH_PLAYERS = 4;
export const MATCH_DURATION_MS = 20 * 60_000;
export const PLAYER_HP = 100;

export const POSSESS_FIRST_READY_MS = 60_000;
export const POSSESS_DURATION_MS = 8_000;
export const POSSESS_COOLDOWN_MS = 45_000;
export const POSSESS_RANGE = 12;
export const LINK_DAMAGE_RATIO = 0.4;
export const MONSTER_DEATH_BODY_DAMAGE = 35;
export const PAIN_RADIUS = 10;

export const MONSTER_STATS = {
  zombie: { hp: 100, damage: 20, range: 1.8, intervalMs: 1_200, speed: 1.8, aggro: 14 },
  boss: { hp: 800, damage: 35, range: 2.6, intervalMs: 1_600, speed: 1.5, aggro: 26 },
} as const;

export const ZOMBIE_HP = MONSTER_STATS.zombie.hp;
export const ZOMBIE_ATTACK_DAMAGE = MONSTER_STATS.zombie.damage;
export const ZOMBIE_ATTACK_RANGE = MONSTER_STATS.zombie.range;
export const ZOMBIE_ATTACK_INTERVAL_MS = MONSTER_STATS.zombie.intervalMs;

export const AKM_DAMAGE = 34;
export const AKM_FIRE_INTERVAL_MS = 100;
export const AKM_RANGE = 60;

// Positions arrive throttled from clients, so range checks allow for lag.
export const RANGE_SLACK = 1.5;
export const EXIT_RADIUS = 2;

// In-match objectives (Plan 4).
export const SHARD_COUNT = 2;
export const DEVICE_COUNT = 2;
export const INTERACT_RANGE = 3;
export const DEVICE_ACTIVE_MS = 8_000;
export const SEAL_DURATION_MS = 60_000;
export const SEAL_RADIUS = 6;
// Server ticks can stall; one tick never adds more than this to the seal.
export const SEAL_TICK_CAP_MS = 2_000;
export const SEAL_WAVE_AT_MS = [0, 20_000, 40_000] as const;
export const WAVE_SIZE = 3;

// Plate votes (Plan 4).
export const PLATE_RADIUS = 1.2;
export const PLATE_HOLD_MS = 5_000;
export const PLATE_LOCK_MS = 90_000;
export const BIND_MS = 20_000;
```

- [ ] **Step 4: 타입**

`src/game/match/types.ts`:
- `MonsterState`의 `kind: "zombie";`를 `kind: MonsterKind;`로 바꾸고, 그 위에 더한다:

```ts
export type MonsterKind = "zombie" | "boss";
```

- `SecretRef` 선언 위에 더한다:

```ts
export type Stage = "shards" | "devices" | "seal" | "boss" | "exit";
export const STAGES: readonly Stage[] = ["shards", "devices", "seal", "boss", "exit"];

export interface SealState {
  progressMs: number;
  // Server time the channel was last advanced; null until someone starts it at the altar.
  lastAt: number | null;
  waves: number;
}

export interface ObjectiveState {
  stage: Stage;
  shards: boolean[];
  // Server time each device stays on until.
  devices: number[];
  gates: number[];
  seal: SealState;
}

export interface VoteRecord { accused: string; guilty: boolean; at: number }

export interface VoteState {
  // Plate that currently has enough voters, and since when.
  plate: number | null;
  since: number;
  lockedUntil: number;
  last: VoteRecord | null;
}
```

- `PublicMatch`의 `devClockOffsetMs: number;` 위에 더한다:

```ts
  objectives: ObjectiveState;
  // Account -> server time their binding ends.
  bound: Record<string, number>;
  // The traitor, once a plate vote has exposed them.
  revealed: string | null;
  vote: VoteState;
```

- `RULE_ERRORS`를 바꾼다:

```ts
export const RULE_ERRORS = [
  "not_playing", "not_traitor", "not_ready", "already_possessing", "not_possessing",
  "unavailable", "no_monster", "monster_dead", "out_of_range", "too_fast",
  "not_authority", "stunned", "no_target", "not_at_exit", "match_full",
  "nothing_here", "need_shards", "exit_locked", "sealed", "bound",
] as const;
```

- [ ] **Step 5: 생성·도우미**

`src/game/match/lifecycle.ts` 전체를 바꾼다:

```ts
import {
  DEVICE_COUNT, MATCH_DURATION_MS, MATCH_PLAYERS, MONSTER_STATS, PLAYER_HP, POSSESS_FIRST_READY_MS, SHARD_COUNT,
} from "./constants";
import {
  RuleViolation, type MonsterKind, type MonsterSpawn, type MonsterState, type ObjectiveState, type PlayerStats,
  type PublicMatch, type SecretMatch, type Vec2, type VoteState,
} from "./types";

export function createObjectives(): ObjectiveState {
  return {
    stage: "shards",
    shards: Array.from({ length: SHARD_COUNT }, () => false),
    devices: Array.from({ length: DEVICE_COUNT }, () => 0),
    gates: [],
    seal: { progressMs: 0, lastAt: null, waves: 0 },
  };
}

export function createVote(): VoteState {
  return { plate: null, since: 0, lockedUntil: 0, last: null };
}

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
    objectives: createObjectives(),
    bound: {},
    revealed: null,
    vote: createVote(),
    devClockOffsetMs: 0,
  };
}

export function newMonster(kind: MonsterKind, x: number, z: number): MonsterState {
  return {
    kind, x, z, yaw: 0, hp: MONSTER_STATS[kind].hp,
    alive: true, possessed: false, stunnedUntil: 0, attackReadyAt: 0,
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
  for (const spawn of spawns) match.monsters[spawn.id] = newMonster("zombie", spawn.x, spawn.z);
  match.objectives = createObjectives();
  match.bound = {};
  match.revealed = null;
  match.vote = createVote();

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
  return { monsterKills: 0, monsterDamage: 0, traitorDamage: 0, possessions: 0, possessedDamage: 0 };
}

export function isActive(match: PublicMatch, account: string): boolean {
  return match.players.includes(account) && !match.dead.includes(account) && !match.escaped.includes(account);
}

export function isBound(match: PublicMatch, account: string, now: number): boolean {
  return (match.bound[account] ?? 0) > now;
}

export function monsterSpawnsFor(layout: { zombieSpawns: Vec2[] }): MonsterSpawn[] {
  return layout.zombieSpawns.map((s, i) => ({ id: `zombie-${i}`, x: s.x, z: s.z }));
}
```

- [ ] **Step 6: 빙의 제한**

`src/game/match/possession.ts`의 `startPossession`에서:
- `if (!isActive(match, account)) throw new RuleViolation("unavailable");` 아래에 `if (match.revealed === account) throw new RuleViolation("sealed");`
- `if (!monster.alive) throw new RuleViolation("monster_dead");` 아래에 `if (monster.kind === "boss") throw new RuleViolation("unavailable");`

- [ ] **Step 7: 공격·사격·탈출 검사**

`src/game/match/damage.ts`:
- constants import를 바꾼다:

```ts
import {
  AKM_DAMAGE, AKM_FIRE_INTERVAL_MS, AKM_RANGE, EXIT_RADIUS, LINK_DAMAGE_RATIO,
  MONSTER_DEATH_BODY_DAMAGE, MONSTER_STATS, PAIN_RADIUS, RANGE_SLACK,
} from "./constants";
import { isActive, isBound } from "./lifecycle";
```

- `monsterAttack`의 사거리 검사부터 끝까지를 바꾼다:

```ts
  const stats = MONSTER_STATS[monster.kind];
  if (!targetPose || distance(monster, targetPose) > stats.range + RANGE_SLACK) {
    throw new RuleViolation("out_of_range");
  }

  monster.attackReadyAt = now + stats.intervalMs;
  if (monster.possessed) {
    secret.stats[secret.traitor].possessedDamage += Math.min(stats.damage, secret.hp[target] ?? 0);
  }
  events.push(...damageBody(match, secret, target, stats.damage, now));
  return events;
}
```

- `reachExit`를 바꾼다:

```ts
export function reachExit(
  match: PublicMatch, secret: SecretMatch, account: string, pose: Pose | null, exits: Vec2[], now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (!isActive(match, account)) throw new RuleViolation("unavailable");
  if (!pose || !exits.some((e) => distance(pose, e) <= EXIT_RADIUS)) throw new RuleViolation("not_at_exit");
  if (match.objectives.stage !== "exit") throw new RuleViolation("exit_locked");
  if (isBound(match, account, now)) throw new RuleViolation("bound");
  match.escaped.push(account);
  if (account === secret.traitor) events.push(...endPossession(match, secret, now));
  return events;
}
```

- `beginShot`의 `if (!isActive(match, shooter)) ...` 아래에 `if (isBound(match, shooter, now)) throw new RuleViolation("bound");`

- [ ] **Step 8: 종류별 몬스터 AI**

`src/game/match/monsterAi.ts` 전체를 바꾼다:

```ts
import { stepPlayer, type SolidTest } from "../rules/movement";
import { MONSTER_STATS } from "./constants";
import type { MonsterPoseUpdate } from "./damage";
import { isActive } from "./lifecycle";
import type { Poses, PublicMatch } from "./types";
import { distance } from "./view";

export const ZOMBIE_SPEED = MONSTER_STATS.zombie.speed;
export const ZOMBIE_AGGRO_RANGE = MONSTER_STATS.zombie.aggro;

export interface MonsterOrder { monsterId: string; target: string }
export interface AiStep { updates: MonsterPoseUpdate[]; attacks: MonsterOrder[] }

export function stepMonsterAi(
  match: PublicMatch, poses: Poses, isSolid: SolidTest, dt: number, now: number, skip: (monsterId: string) => boolean,
): AiStep {
  const updates: MonsterPoseUpdate[] = [];
  const attacks: MonsterOrder[] = [];
  for (const [id, monster] of Object.entries(match.monsters)) {
    if (!monster.alive || monster.possessed || now < monster.stunnedUntil || skip(id)) continue;
    const stats = MONSTER_STATS[monster.kind];

    let target: { account: string; x: number; z: number; d: number } | null = null;
    for (const account of match.players) {
      const pose = poses[account];
      if (!pose || !isActive(match, account)) continue;
      const d = distance(pose, monster);
      if (d <= stats.aggro && (!target || d < target.d)) target = { account, x: pose.x, z: pose.z, d };
    }
    if (!target) continue;

    const yaw = Math.atan2(-(target.x - monster.x), -(target.z - monster.z));
    if (target.d > stats.range * 0.8) {
      const moved = stepPlayer({ x: monster.x, z: monster.z, yaw }, { forward: 1, strafe: 0 }, dt, isSolid, stats.speed);
      updates.push({ id, x: moved.x, z: moved.z, yaw });
    } else {
      updates.push({ id, x: monster.x, z: monster.z, yaw });
      if (now >= monster.attackReadyAt) attacks.push({ monsterId: id, target: target.account });
    }
  }
  return { updates, attacks };
}
```

- [ ] **Step 9: 전체 확인**

Run: `npm run typecheck && npx vitest run tests/match`
Expected: 타입 에러 없음, `tests/match` 전부 PASS. (서버·클라이언트 쪽 오류가 나면 이 작업 범위의 파일만 고친다. 서버 테스트는 작업 5에서 맞춘다.)

- [ ] **Step 10: 커밋**

```bash
git add src/game/match tests/match
git commit -m "feat: monster kinds, objective and vote state, bound and sealed checks, 20-minute matches"
git push origin master
```

---

### Task 3: 협동 목표 규칙 (objectives.ts)

**Files:**
- Create: `src/game/match/objectives.ts`
- Create: `tests/match/objectives.test.ts`

**Interfaces:**
- Consumes: 작업 1의 `LevelLayout` 필드, 작업 2의 상수·타입·`newMonster`·`isBound`.
- Produces:
  - `ObjectiveLayout = Pick<LevelLayout, "shards" | "devices" | "altar" | "waveSpawns" | "bossSpawn" | "gates">`
  - `BOSS_ID = "boss"`
  - `Interactable` (`shard` | `gate` | `device` | `altar`, 각각 `at: Vec2`, 조각·장치는 `index`)
  - `interactableNear(match, level, pose, now): Interactable | null`
  - `operateObjective(match, secret, account, pose, level, now): void` — 오류 `not_playing`·`unavailable`·`bound`·`nothing_here`·`need_shards`
  - `advanceObjectives(match, poses: Poses | null, level, now): void`
  - `skipToStage(match, level, stage, now): void` (개발용)

- [ ] **Step 1: 실패하는 테스트**

`tests/match/objectives.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEVICE_ACTIVE_MS, MONSTER_STATS, SEAL_DURATION_MS, SEAL_TICK_CAP_MS, WAVE_SIZE,
} from "../../src/game/match/constants";
import { createLobby, joinLobby, monsterSpawnsFor, startMatch } from "../../src/game/match/lifecycle";
import {
  BOSS_ID, advanceObjectives, interactableNear, operateObjective, skipToStage,
} from "../../src/game/match/objectives";
import { startPossession } from "../../src/game/match/possession";
import type { Poses, Vec2 } from "../../src/game/match/types";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";

const level = parseLevel(RUINS, TILE_SIZE);
const gate1 = level.gates[0];
const altar = level.altar!;
const pose = (p: Vec2) => ({ x: p.x, z: p.z, yaw: 0 });
const T = 100_000;

// Traitor is "c".
function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  const secret = startMatch(match, 0, () => 0.6, monsterSpawnsFor(level));
  return { match, secret };
}

describe("shards", () => {
  it("picks up shards one by one and opens the first gate with both", () => {
    const { match, secret } = playing();
    expect(() => operateObjective(match, secret, "a", pose(level.playerSpawn), level, T)).toThrow("nothing_here");
    operateObjective(match, secret, "a", pose(level.shards[0]), level, T);
    expect(match.objectives.shards).toEqual([true, false]);
    expect(() => operateObjective(match, secret, "a", pose(level.shards[0]), level, T)).toThrow("nothing_here");
    const atGate = { x: gate1.x - 2.8, z: gate1.z, yaw: 0 };
    expect(() => operateObjective(match, secret, "a", atGate, level, T)).toThrow("need_shards");
    operateObjective(match, secret, "b", pose(level.shards[1]), level, T);
    expect(interactableNear(match, level, atGate, T)?.kind).toBe("gate");
    operateObjective(match, secret, "b", atGate, level, T);
    expect(match.objectives.gates).toEqual([1]);
    expect(match.objectives.stage).toBe("devices");
  });

  it("refuses bound, gone or frozen players", () => {
    const { match, secret } = playing();
    match.bound.a = T + 1;
    expect(() => operateObjective(match, secret, "a", pose(level.shards[0]), level, T)).toThrow("bound");
    match.dead.push("b");
    expect(() => operateObjective(match, secret, "b", pose(level.shards[0]), level, T)).toThrow("unavailable");
    startPossession(match, secret, "c", "zombie-0", { x: 34, z: 20 }, T);
    expect(() => operateObjective(match, secret, "c", pose(level.shards[0]), level, T)).toThrow("unavailable");
    expect(() => operateObjective(match, secret, "d", null, level, T)).toThrow("nothing_here");
  });
});

describe("devices", () => {
  it("opens the second gate only while both devices are on together", () => {
    const { match, secret } = playing();
    skipToStage(match, level, "devices", T);
    operateObjective(match, secret, "a", pose(level.devices[0]), level, T);
    expect(match.objectives.devices[0]).toBe(T + DEVICE_ACTIVE_MS);
    expect(() => operateObjective(match, secret, "a", pose(level.devices[0]), level, T + 1)).toThrow("nothing_here");
    operateObjective(match, secret, "b", pose(level.devices[1]), level, T + DEVICE_ACTIVE_MS);
    expect(match.objectives.gates).toEqual([1]);
    operateObjective(match, secret, "a", pose(level.devices[0]), level, T + DEVICE_ACTIVE_MS + 10);
    expect(match.objectives.gates).toEqual([1, 2]);
    expect(match.objectives.stage).toBe("seal");
  });
});

describe("seal", () => {
  it("starts at the altar with a first wave and moves only while guarded", () => {
    const { match, secret } = playing();
    skipToStage(match, level, "seal", T);
    const before = Object.keys(match.monsters).length;
    operateObjective(match, secret, "a", pose(altar), level, T);
    expect(Object.keys(match.monsters).length).toBe(before + WAVE_SIZE);
    expect(match.monsters["wave-0-0"]).toMatchObject({ kind: "zombie", alive: true });
    expect(match.objectives.seal).toEqual({ progressMs: 0, lastAt: T, waves: 1 });
    expect(() => operateObjective(match, secret, "b", pose(altar), level, T)).toThrow("nothing_here");

    const guarded: Poses = { a: pose(altar), b: null, c: null, d: null };
    const away: Poses = { a: pose(level.playerSpawn), b: null, c: null, d: null };
    advanceObjectives(match, guarded, level, T + 1000);
    expect(match.objectives.seal.progressMs).toBe(1000);
    advanceObjectives(match, away, level, T + 2000);
    expect(match.objectives.seal.progressMs).toBe(1000);
    advanceObjectives(match, guarded, level, T + 60_000);
    expect(match.objectives.seal.progressMs).toBe(1000 + SEAL_TICK_CAP_MS);
    advanceObjectives(match, null, level, T + 61_000);
    expect(match.objectives.seal.progressMs).toBe(1000 + SEAL_TICK_CAP_MS);
  });

  it("sends the remaining waves, then opens the boss room and wakes the boss", () => {
    const { match, secret } = playing();
    skipToStage(match, level, "seal", T);
    operateObjective(match, secret, "a", pose(altar), level, T);
    match.objectives.seal.progressMs = SEAL_DURATION_MS - 500;
    advanceObjectives(match, { a: pose(altar) }, level, T + 1000);
    expect(match.objectives.seal.waves).toBe(3);
    expect(match.monsters["wave-2-2"]).toBeDefined();
    expect(match.objectives.gates).toEqual([1, 2, 3]);
    expect(match.objectives.stage).toBe("boss");
    expect(match.monsters[BOSS_ID]).toMatchObject({ kind: "boss", hp: MONSTER_STATS.boss.hp, x: 54, z: 38 });
  });

  it("does not count dead players as guards", () => {
    const { match, secret } = playing();
    skipToStage(match, level, "seal", T);
    operateObjective(match, secret, "a", pose(altar), level, T);
    match.dead.push("a");
    advanceObjectives(match, { a: pose(altar) }, level, T + 1000);
    expect(match.objectives.seal.progressMs).toBe(0);
  });
});

describe("boss and exit", () => {
  it("opens the exit once the boss is down", () => {
    const { match } = playing();
    skipToStage(match, level, "boss", T);
    advanceObjectives(match, null, level, T);
    expect(match.objectives.stage).toBe("boss");
    match.monsters[BOSS_ID].alive = false;
    advanceObjectives(match, null, level, T);
    expect(match.objectives.stage).toBe("exit");
  });

  it("skips straight to a later stage for testing", () => {
    const { match } = playing();
    skipToStage(match, level, "exit", T);
    expect(match.objectives).toMatchObject({ stage: "exit", shards: [true, true], gates: [1, 2, 3] });
    expect(match.monsters[BOSS_ID].alive).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/match/objectives.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/game/match/objectives.ts`:

```ts
import type { LevelLayout } from "../rules/levelLayout";
import {
  DEVICE_ACTIVE_MS, INTERACT_RANGE, RANGE_SLACK, SEAL_DURATION_MS, SEAL_RADIUS, SEAL_TICK_CAP_MS,
  SEAL_WAVE_AT_MS, WAVE_SIZE,
} from "./constants";
import { isActive, isBound, newMonster } from "./lifecycle";
import {
  RuleViolation, STAGES, type Poses, type PublicMatch, type SecretMatch, type Stage, type Vec2,
} from "./types";
import { distance } from "./view";

export type ObjectiveLayout = Pick<LevelLayout, "shards" | "devices" | "altar" | "waveSpawns" | "bossSpawn" | "gates">;

export const BOSS_ID = "boss";
const REACH = INTERACT_RANGE + RANGE_SLACK;

export type Interactable =
  | { kind: "shard"; index: number; at: Vec2 }
  | { kind: "gate"; at: Vec2 }
  | { kind: "device"; index: number; at: Vec2 }
  | { kind: "altar"; at: Vec2 };

// What a player standing here could use right now, nearest first. The server and the HUD share it.
export function interactableNear(match: PublicMatch, level: ObjectiveLayout, pose: Vec2, now: number): Interactable | null {
  const o = match.objectives;
  const options: Interactable[] = [];
  if (o.stage === "shards") {
    level.shards.forEach((at, index) => {
      if (!o.shards[index]) options.push({ kind: "shard", index, at });
    });
    const gate = level.gates.find((g) => g.n === 1);
    if (gate && o.shards.every(Boolean)) options.push({ kind: "gate", at: gate });
  }
  if (o.stage === "devices") {
    level.devices.forEach((at, index) => {
      if (o.devices[index] <= now) options.push({ kind: "device", index, at });
    });
  }
  if (o.stage === "seal" && level.altar && o.seal.lastAt === null) options.push({ kind: "altar", at: level.altar });

  let best: Interactable | null = null;
  let bestDistance = REACH;
  for (const option of options) {
    const d = distance(pose, option.at);
    if (d <= bestDistance) {
      best = option;
      bestDistance = d;
    }
  }
  return best;
}

export function operateObjective(
  match: PublicMatch, secret: SecretMatch, account: string, pose: Vec2 | null, level: ObjectiveLayout, now: number,
): void {
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (!isActive(match, account)) throw new RuleViolation("unavailable");
  // A possessing traitor's body stands frozen.
  if (secret.possession && secret.traitor === account) throw new RuleViolation("unavailable");
  if (isBound(match, account, now)) throw new RuleViolation("bound");
  if (!pose) throw new RuleViolation("nothing_here");

  const o = match.objectives;
  const target = interactableNear(match, level, pose, now);
  if (!target) {
    const gate = level.gates.find((g) => g.n === 1);
    if (o.stage === "shards" && gate && distance(pose, gate) <= REACH) throw new RuleViolation("need_shards");
    throw new RuleViolation("nothing_here");
  }

  switch (target.kind) {
    case "shard":
      o.shards[target.index] = true;
      break;
    case "gate":
      openGate(match, 1);
      o.stage = "devices";
      break;
    case "device":
      o.devices[target.index] = now + DEVICE_ACTIVE_MS;
      if (o.devices.every((until) => until > now)) {
        openGate(match, 2);
        o.stage = "seal";
      }
      break;
    case "altar":
      o.seal.lastAt = now;
      spawnWave(match, level);
      break;
  }
}

// Clock-driven progress. The seal needs positions, so it only moves when poses are given (server ticks).
export function advanceObjectives(match: PublicMatch, poses: Poses | null, level: ObjectiveLayout, now: number): void {
  if (match.phase !== "playing") return;
  const o = match.objectives;
  const altar = level.altar;
  if (o.stage === "seal" && o.seal.lastAt !== null && poses && altar) {
    const guarded = match.players.some((p) => {
      const pose = poses[p];
      return !!pose && isActive(match, p) && distance(pose, altar) <= SEAL_RADIUS;
    });
    const step = Math.min(Math.max(0, now - o.seal.lastAt), SEAL_TICK_CAP_MS);
    o.seal.lastAt = now;
    if (guarded) o.seal.progressMs = Math.min(SEAL_DURATION_MS, o.seal.progressMs + step);
    while (o.seal.waves < SEAL_WAVE_AT_MS.length && o.seal.progressMs >= SEAL_WAVE_AT_MS[o.seal.waves]) {
      spawnWave(match, level);
    }
    if (o.seal.progressMs >= SEAL_DURATION_MS) wakeBoss(match, level);
  }
  if (o.stage === "boss") {
    const boss = match.monsters[BOSS_ID];
    if (!boss || !boss.alive) o.stage = "exit";
  }
}

// Development shortcut: jump forward to a stage with everything before it done.
export function skipToStage(match: PublicMatch, level: ObjectiveLayout, stage: Stage, now: number): void {
  const order = STAGES.indexOf(stage);
  if (order < 0) throw new RuleViolation("unavailable");
  const o = match.objectives;
  if (order >= 1) {
    o.shards = o.shards.map(() => true);
    openGate(match, 1);
  }
  if (order >= 2) openGate(match, 2);
  if (order >= 3) {
    o.seal = { progressMs: SEAL_DURATION_MS, lastAt: now, waves: SEAL_WAVE_AT_MS.length };
    wakeBoss(match, level);
  }
  const boss = match.monsters[BOSS_ID];
  if (order >= 4 && boss) {
    boss.hp = 0;
    boss.alive = false;
  }
  o.stage = stage;
}

function openGate(match: PublicMatch, n: number): void {
  if (!match.objectives.gates.includes(n)) match.objectives.gates.push(n);
}

function wakeBoss(match: PublicMatch, level: ObjectiveLayout): void {
  openGate(match, 3);
  match.objectives.stage = "boss";
  if (level.bossSpawn && !match.monsters[BOSS_ID]) {
    match.monsters[BOSS_ID] = newMonster("boss", level.bossSpawn.x, level.bossSpawn.z);
  }
}

function spawnWave(match: PublicMatch, level: ObjectiveLayout): void {
  const seal = match.objectives.seal;
  const spots = level.waveSpawns;
  for (let i = 0; i < WAVE_SIZE && spots.length > 0; i++) {
    const at = spots[(seal.waves * WAVE_SIZE + i) % spots.length];
    match.monsters[`wave-${seal.waves}-${i}`] = newMonster("zombie", at.x, at.z);
  }
  seal.waves += 1;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/match/objectives.test.ts`
Expected: PASS (8개).

- [ ] **Step 5: 커밋**

```bash
git add src/game/match/objectives.ts tests/match/objectives.test.ts
git commit -m "feat: staged co-op objectives with shards, devices, a guarded seal, waves and a boss"
git push origin master
```

---

### Task 4: 몸으로 투표 규칙 (vote.ts)

**Files:**
- Create: `src/game/match/vote.ts`
- Create: `tests/match/vote.test.ts`

**Interfaces:**
- Consumes: 작업 2의 `VoteState`, `PLATE_*`, `BIND_MS`, `endPossession`.
- Produces:
  - `PlateTally = { plate: number; accused: string; votes: number; needed: number; voters: string[] }`
  - `tallyPlates(match, poses, plates): PlateTally[]` — 발판 i는 `match.players[i]`를 가리킨다. 지목될 사람이 활동 중일 때만.
  - `votingOpen(match, now): boolean`
  - `stepVote(match, secret, poses, plates, now): MatchEvent[]`

- [ ] **Step 1: 실패하는 테스트**

`tests/match/vote.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BIND_MS, PLATE_HOLD_MS, PLATE_LOCK_MS } from "../../src/game/match/constants";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { startPossession } from "../../src/game/match/possession";
import type { Pose, Poses } from "../../src/game/match/types";
import { stepVote, tallyPlates, votingOpen } from "../../src/game/match/vote";

const T = 100_000;
const PLATES = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }, { x: 30, z: 0 }];
const at = (x: number, z: number): Pose => ({ x, z, yaw: 0 });
const away = at(50, 50);

// Players a, b, c, d own plates 0..3. Traitor is "c".
function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  const secret = startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 60, z: 50 }]);
  return { match, secret };
}

describe("tallyPlates", () => {
  it("counts the other living players standing on each plate", () => {
    const { match } = playing();
    const poses: Poses = { a: at(20.5, 0), b: at(20, 1), c: at(20, 0), d: away };
    const c = tallyPlates(match, poses, PLATES).find((t) => t.accused === "c")!;
    expect(c).toEqual({ plate: 2, accused: "c", votes: 2, needed: 2, voters: ["a", "b"] });
    match.dead.push("d");
    expect(tallyPlates(match, poses, PLATES).find((t) => t.accused === "c")!.needed).toBe(2);
    match.dead.push("a");
    expect(tallyPlates(match, poses, PLATES).find((t) => t.accused === "c")).toMatchObject({ votes: 1, needed: 1 });
    expect(tallyPlates(match, poses, PLATES).some((t) => t.accused === "a")).toBe(false);
  });
});

describe("stepVote", () => {
  it("exposes the traitor after the voters hold the plate, and ends the possession", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", at(55, 50), T);
    const poses: Poses = { a: at(20, 0), b: at(20, 0.5), c: away, d: away };
    expect(stepVote(match, secret, poses, PLATES, T)).toEqual([]);
    expect(match.vote).toMatchObject({ plate: 2, since: T });
    expect(stepVote(match, secret, poses, PLATES, T + PLATE_HOLD_MS - 1)).toEqual([]);
    const events = stepVote(match, secret, poses, PLATES, T + PLATE_HOLD_MS);
    expect(match.revealed).toBe("c");
    expect(match.vote.last).toEqual({ accused: "c", guilty: true, at: T + PLATE_HOLD_MS });
    expect(secret.possession).toBeNull();
    expect(events.some((e) => e.type === "possession")).toBe(true);
    expect(votingOpen(match, T + PLATE_HOLD_MS)).toBe(false);
  });

  it("restarts the hold when voters step off", () => {
    const { match, secret } = playing();
    const on: Poses = { a: at(20, 0), b: at(20, 0.5), c: away, d: away };
    const off: Poses = { a: at(20, 0), b: away, c: away, d: away };
    stepVote(match, secret, on, PLATES, T);
    stepVote(match, secret, off, PLATES, T + 3000);
    expect(match.vote.plate).toBeNull();
    stepVote(match, secret, on, PLATES, T + 4000);
    stepVote(match, secret, on, PLATES, T + 4000 + PLATE_HOLD_MS - 1);
    expect(match.revealed).toBeNull();
  });

  it("binds an innocent player and locks the plates for a while", () => {
    const { match, secret } = playing();
    const onB: Poses = { a: at(10, 0), b: away, c: at(10, 0.5), d: away };
    stepVote(match, secret, onB, PLATES, T);
    stepVote(match, secret, onB, PLATES, T + PLATE_HOLD_MS);
    const decided = T + PLATE_HOLD_MS;
    expect(match.bound.b).toBe(decided + BIND_MS);
    expect(match.vote.last).toEqual({ accused: "b", guilty: false, at: decided });
    expect(match.vote.lockedUntil).toBe(decided + PLATE_LOCK_MS);
    expect(match.revealed).toBeNull();

    const onC: Poses = { a: at(20, 0), b: at(20, 0.5), c: away, d: away };
    stepVote(match, secret, onC, PLATES, decided + 1);
    stepVote(match, secret, onC, PLATES, decided + 1 + PLATE_HOLD_MS);
    expect(match.revealed).toBeNull();
    expect(match.vote.plate).toBeNull();

    stepVote(match, secret, onC, PLATES, decided + PLATE_LOCK_MS);
    stepVote(match, secret, onC, PLATES, decided + PLATE_LOCK_MS + PLATE_HOLD_MS);
    expect(match.revealed).toBe("c");
  });

  it("does nothing outside a running match", () => {
    const { match, secret } = playing();
    match.phase = "ended";
    const poses: Poses = { a: at(20, 0), b: at(20, 0), c: away, d: away };
    stepVote(match, secret, poses, PLATES, T);
    expect(match.vote.plate).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/match/vote.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/game/match/vote.ts`:

```ts
import { BIND_MS, PLATE_HOLD_MS, PLATE_LOCK_MS, PLATE_RADIUS } from "./constants";
import { isActive } from "./lifecycle";
import { endPossession } from "./possession";
import type { MatchEvent, Poses, PublicMatch, SecretMatch, Vec2 } from "./types";
import { distance } from "./view";

export interface PlateTally { plate: number; accused: string; votes: number; needed: number; voters: string[] }

// Plate i names match.players[i]. It carries once more than half of the other living players stand on it.
export function tallyPlates(match: PublicMatch, poses: Poses, plates: Vec2[]): PlateTally[] {
  const tallies: PlateTally[] = [];
  plates.forEach((plate, i) => {
    const accused = match.players[i];
    if (!accused || !isActive(match, accused)) return;
    const others = match.players.filter((p) => p !== accused && isActive(match, p));
    if (others.length === 0) return;
    const voters = others.filter((p) => {
      const pose = poses[p];
      return !!pose && distance(pose, plate) <= PLATE_RADIUS;
    });
    tallies.push({ plate: i, accused, votes: voters.length, needed: Math.floor(others.length / 2) + 1, voters });
  });
  return tallies;
}

export function votingOpen(match: PublicMatch, now: number): boolean {
  return match.phase === "playing" && match.revealed === null && now >= match.vote.lockedUntil;
}

export function stepVote(match: PublicMatch, secret: SecretMatch, poses: Poses, plates: Vec2[], now: number): MatchEvent[] {
  const vote = match.vote;
  if (!votingOpen(match, now)) {
    vote.plate = null;
    return [];
  }
  const carried = tallyPlates(match, poses, plates).find((t) => t.votes >= t.needed) ?? null;
  if (!carried) {
    vote.plate = null;
    return [];
  }
  if (vote.plate !== carried.plate) {
    vote.plate = carried.plate;
    vote.since = now;
    return [];
  }
  if (now - vote.since < PLATE_HOLD_MS) return [];

  vote.plate = null;
  const guilty = carried.accused === secret.traitor;
  vote.last = { accused: carried.accused, guilty, at: now };
  if (guilty) {
    match.revealed = carried.accused;
    return endPossession(match, secret, now);
  }
  match.bound[carried.accused] = now + BIND_MS;
  vote.lockedUntil = now + PLATE_LOCK_MS;
  return [];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/match`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/game/match/vote.ts tests/match/vote.test.ts
git commit -m "feat: plate votes that expose the traitor or bind an innocent player"
git push origin master
```

---

### Task 5: 서버 (상호작용, 단계 건너뛰기, 틱 판정)

**Files:**
- Modify: `server/src/server.ts`
- Create: `server/test/objectives.test.ts`
- Modify: `server/test/match.test.ts`, `server/test/actions.test.ts`

**Interfaces:**
- Consumes: 작업 1 `RUINS`, 작업 3 `operateObjective`·`advanceObjectives`·`skipToStage`, 작업 4 `stepVote`.
- Produces: 서버 함수 `interact()`, `devSetStage(stage)`(`test-` 계정만). `$roomTick`은 경기 중이면 매 틱 위치를 읽어 투표·봉인·시간 종료를 판정하고, 바뀐 것이 있을 때만 저장한다.

- [ ] **Step 1: 실패하는 서버 테스트**

`server/test/objectives.test.ts`:

```ts
import { PLAYERS, actAs, errorOf, fillRoom, findTraitor, placeAll, roomMatch } from "./helpers";

const SHARDS = [{ x: 38, z: 6 }, { x: 6, z: 30 }];
const GATE_1_SIDE = { x: 39.2, z: 18 };
const ALTAR = { x: 82, z: 34 };
const EXIT = { x: 54, z: 46 };
const PLATES = [{ x: 10, z: 10 }, { x: 18, z: 10 }, { x: 10, z: 18 }, { x: 18, z: 18 }];

describe("interact", () => {
  test("collects the shards and opens the first gate", async (server) => {
    const roomId = await fillRoom(server);
    const a = PLAYERS[0];
    const b = PLAYERS[1];
    await placeAll(server, roomId, { [a]: { x: 6, z: 6 } });
    actAs(server, a, roomId);
    expect(await errorOf(server.interact())).toContain("nothing_here");

    await placeAll(server, roomId, { [a]: SHARDS[0], [b]: SHARDS[1] });
    actAs(server, a, roomId);
    await server.interact();
    actAs(server, b, roomId);
    await server.interact();
    await placeAll(server, roomId, { [b]: GATE_1_SIDE });
    actAs(server, b, roomId);
    await server.interact();

    const match = await roomMatch(roomId);
    expect(match.objectives.stage).toBe("devices");
    expect(match.objectives.gates).toEqual([1]);
  });
});

describe("devSetStage", () => {
  test("is for test accounts only and the exit opens at the last stage", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const runner = PLAYERS.filter((p) => p !== traitor)[0];
    await placeAll(server, roomId, { [runner]: EXIT });
    actAs(server, runner, roomId);
    expect(await errorOf(server.escape())).toContain("exit_locked");
    expect(await errorOf(server.devSetStage("nowhere"))).toContain("unavailable");
    await server.devSetStage("exit");
    expect((await roomMatch(roomId)).objectives.stage).toBe("exit");
    await server.escape();
    expect((await roomMatch(roomId)).escaped).toEqual([runner]);

    server.connect({ account: "player-x", roomId });
    expect(await errorOf(server.devSetStage("boss"))).toContain("unavailable");
  });
});

describe("$roomTick", () => {
  test("carries a plate vote once the voters have held it", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const plate = PLAYERS.indexOf(traitor);
    const voters = PLAYERS.filter((p) => p !== traitor).slice(0, 2);
    await placeAll(server, roomId, { [voters[0]]: PLATES[plate], [voters[1]]: PLATES[plate] });
    await server.$roomTick(500, roomId);
    expect((await roomMatch(roomId)).vote.plate).toBe(plate);

    actAs(server, voters[0], roomId);
    await server.devAdvanceClock(5000);
    await server.$roomTick(500, roomId);
    const match = await roomMatch(roomId);
    expect(match.revealed).toBe(traitor);
    expect(match.vote.last.guilty).toBe(true);
  });

  test("moves the seal only while someone guards the altar", async (server) => {
    const roomId = await fillRoom(server);
    const a = PLAYERS[0];
    actAs(server, a, roomId);
    await server.devSetStage("seal");
    await placeAll(server, roomId, { [a]: ALTAR });
    actAs(server, a, roomId);
    await server.interact();
    expect((await roomMatch(roomId)).objectives.seal.waves).toBe(1);

    await server.devAdvanceClock(1000);
    await server.$roomTick(500, roomId);
    const progress = (await roomMatch(roomId)).objectives.seal.progressMs;
    expect(progress >= 1000 && progress < 1500).toBe(true);

    await placeAll(server, roomId, { [a]: { x: 6, z: 6 } });
    actAs(server, a, roomId);
    await server.devAdvanceClock(1000);
    await server.$roomTick(500, roomId);
    expect((await roomMatch(roomId)).objectives.seal.progressMs).toBe(progress);
  });
});
```

`server/test/match.test.ts`: `const EIGHT_MINUTES = 8 * 60_000;`를 `const MATCH_TIME = 20 * 60_000;`로 바꾸고, 파일 안의 `EIGHT_MINUTES`를 모두 `MATCH_TIME`으로 바꾼다.

`server/test/actions.test.ts`의 `"adventurers win when every living adventurer is out, and everyone is told"` 테스트에서:
- `for (const a of adventurers) spots[a] = { x: 38, z: 26 };`를 `for (const a of adventurers) spots[a] = { x: 54, z: 46 };`로 바꾼다.
- `await placeAll(server, roomId, spots);` 아래에 더한다:

```ts
    actAs(server, adventurers[0], roomId);
    await server.devSetStage("exit");
```

- [ ] **Step 2: 실패 확인**

Run: `npm run server:test`
Expected: FAIL — `interact`·`devSetStage` 없음, 탈출이 `exit_locked`.

- [ ] **Step 3: 서버 구현**

`server/src/server.ts`:
- import를 바꾼다:

```ts
import { MATCH_PLAYERS, PROTOCOL_VERSION } from "../../src/game/match/constants";
import {
  applyMonsterPoses, monsterAttack, reachExit, shootMonster, type MonsterPoseUpdate,
} from "../../src/game/match/damage";
import { createLobby, joinLobby, leaveLobby, monsterSpawnsFor, startMatch } from "../../src/game/match/lifecycle";
import { advanceObjectives, operateObjective, skipToStage } from "../../src/game/match/objectives";
import { markLeft, resolveOutcome, settleResults } from "../../src/game/match/outcome";
import { releasePossession, startPossession } from "../../src/game/match/possession";
import {
  RuleViolation, STAGES, type MatchEvent, type PublicMatch, type SecretMatch, type Stage,
} from "../../src/game/match/types";
import { privateView, type PrivateView } from "../../src/game/match/view";
import { stepVote } from "../../src/game/match/vote";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";
```

- `const LEVEL = parseLevel(LEVEL_1, TILE_SIZE);`를 `const LEVEL = parseLevel(RUINS, TILE_SIZE);`로.
- `requireLive` 아래에 더한다:

```ts
function requireTestAccount(): void {
  if (!$sender.account.startsWith("test-")) throw new RuleViolation("unavailable");
}
```

- `inRoom`의 `ctx.events.push(...resolveOutcome(ctx.match, ctx.secret, ctx.now));` 위에 한 줄 더한다:

```ts
    advanceObjectives(ctx.match, null, LEVEL, ctx.now);
```

- `devAdvanceClock`의 검사를 바꾼다:

```ts
  async devAdvanceClock(ms: number): Promise<number> {
    requireTestAccount();
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) throw new RuleViolation("unavailable");
```

- `devAdvanceClock` 아래에 더한다:

```ts
  async devSetStage(stage: unknown): Promise<void> {
    requireTestAccount();
    if (typeof stage !== "string" || !(STAGES as readonly string[]).includes(stage)) {
      throw new RuleViolation("unavailable");
    }
    await inRoom((ctx) => {
      requireLive(ctx);
      skipToStage(ctx.match, LEVEL, stage as Stage, ctx.now);
    });
  }
```

- `attackWithMonster` 아래에 더한다:

```ts
  async interact(): Promise<void> {
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const pose = await readPose(ctx.roomId, ctx.account);
      operateObjective(ctx.match, secret, ctx.account, pose, LEVEL, ctx.now);
    });
  }
```

- `$roomTick` 전체를 바꾼다:

```ts
  // Platform hook (every 200-1000 ms per active room). Drives the clock-based rules:
  // plate votes, the seal channel and the deadline. Saves only when something changed.
  async $roomTick(_deltaMillis: number, roomId: string): Promise<void> {
    const peek = await readMatch(roomId);
    if (!peek || peek.phase !== "playing") return;
    await withRoomLock(roomId, async () => {
      const match = await readMatch(roomId);
      const secret = match ? await readSecret(match) : null;
      if (!match || !secret || match.phase !== "playing") return;
      const before = JSON.stringify([match, secret]);
      const now = clock(match);
      const ctx: RoomContext = { roomId, account: "", match, secret, now, events: [] };
      const poses = await readPoses(roomId, match.players);
      ctx.events.push(...stepVote(match, secret, poses, LEVEL.plates, now));
      advanceObjectives(match, poses, LEVEL, now);
      ctx.events.push(...resolveOutcome(match, secret, now));
      // No $room outside a request: clients see the changes through the room state.
      if (JSON.stringify([match, secret]) !== before) await commit(ctx);
    });
  }
```

- [ ] **Step 4: 통과 확인**

Run: `npm run server:test && npm run server:typecheck`
Expected: 서버 테스트 전부 PASS(23개), 타입 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add server
git commit -m "feat: server interact, test-only stage skip and tick-driven votes and seal"
git push origin master
```

---

### Task 6: 클라이언트 연결 (MatchClient, HostDirector)

**Files:**
- Modify: `src/net/matchClient.ts`, `src/net/hostDirector.ts`
- Modify: `tests/net/matchClient.test.ts`, `tests/net/localWorld.test.ts`

**Interfaces:**
- Produces: `MatchClient.interact(): Promise<string | null>`, `MatchClient.setStage(stage: Stage): Promise<string | null>`. 방 상태에서 내 빙의 몬스터가 더는 빙의 상태가 아니면 개인 상태를 다시 받는다(틱에서 투표로 빙의가 끊긴 경우).

- [ ] **Step 1: 실패하는 테스트**

`tests/net/matchClient.test.ts` 맨 아래 `describe` 안(마지막 `it` 뒤)에 더한다:

```ts
  it("uses what is nearby and can skip stages in test rooms", async () => {
    const world = new LocalWorld(new Server());
    const [a] = await joinAll(world);
    a.reportPose({ x: 6, z: 6, yaw: 0 });
    await settle(world);
    expect(await a.interact()).toBe("nothing_here");
    expect(await a.setStage("exit")).toBeNull();
    await settle(world);
    expect(a.state.match!.objectives.stage).toBe("exit");
  });

  it("notices when a tick ends its possession", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    const traitor = clients.find((c) => c.state.you.role === "traitor")!;
    await traitor.advanceClock(60_000);
    traitor.reportPose({ x: 30, z: 14, yaw: 0 });
    await settle(world);
    expect(await traitor.possess("zombie-0")).toBeNull();
    expect(traitor.state.you.possession).not.toBeNull();

    const voters = clients.filter((c) => c !== traitor).slice(0, 2);
    const plate = [{ x: 10, z: 10 }, { x: 18, z: 10 }, { x: 10, z: 18 }, { x: 18, z: 18 }][
      traitor.state.match!.players.indexOf(traitor.account)
    ];
    for (const v of voters) v.reportPose({ x: plate.x, z: plate.z, yaw: 0 });
    await settle(world);
    await world.tickAll();
    await voters[0].advanceClock(5000);
    await world.tickAll();
    await settle(world);
    expect(traitor.state.match!.revealed).toBe(traitor.account);
    expect(traitor.state.you.possession).toBeNull();
  });
```

(`joinAll`·`settle`는 이 파일에 이미 있다. `settle`이 `world.idle()`과 마이크로태스크 비우기를 하는지 확인하고, 없으면 `await world.idle(); await Promise.resolve();`로 대신한다.)

`tests/net/localWorld.test.ts`의 `vi.setSystemTime(1_000_000 + 9 * 60_000);`을 `vi.setSystemTime(1_000_000 + 21 * 60_000);`으로 바꾼다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/net`
Expected: FAIL — `interact`·`setStage` 없음.

- [ ] **Step 3: 구현**

`src/net/matchClient.ts`:
- import에 `type Stage`를 더한다: `import { RULE_ERRORS, type Pose, type PublicMatch, type Stage } from "../game/match/types";`
- `escape()` 위에 더한다:

```ts
  interact(): Promise<string | null> {
    return this.act("interact", []);
  }

  setStage(stage: Stage): Promise<string | null> {
    return this.act("devSetStage", [stage]);
  }
```

- `onRoomState`를 바꾼다:

```ts
  private onRoomState(state: Record<string, unknown>): void {
    const match = state.match as PublicMatch | undefined;
    if (!match || match.version !== 1) return;
    this.set({ match: this.keepOwnMonsters(match), phase: match.phase });
    // Ticks cannot message players, so a possession ended by a vote shows up only here.
    const held = this.current.you.possession;
    const lost = held !== null && match.monsters[held.monsterId]?.possessed !== true;
    if (match.phase === "playing" && (this.current.you.role === null || lost) && !this.refreshing) {
      this.refreshing = true;
      this.refresh()
        .catch((error) => this.fail(error))
        .finally(() => {
          this.refreshing = false;
        });
    }
  }
```

`src/net/hostDirector.ts`:

```ts
import { stepMonsterAi } from "../game/match/monsterAi";
import type { Pose, Poses } from "../game/match/types";
import { solidWith, type LevelLayout } from "../game/rules/levelLayout";
import type { MatchClient } from "./matchClient";

export class HostDirector {
  private attacking = false;

  constructor(
    private readonly client: MatchClient,
    private readonly layout: LevelLayout,
  ) {}

  update(dt: number, ownPose: Pose | null): void {
    const { phase, match, poses } = this.client.state;
    if (phase !== "playing" || !match || this.client.host() !== this.client.account) return;
    const all: Poses = { ...poses };
    if (ownPose) all[this.client.account] = ownPose;
    const isSolid = solidWith(this.layout, match.objectives.gates);
    const step = stepMonsterAi(match, all, isSolid, dt, this.client.serverNow(), () => false);
    this.client.reportMonsters(step.updates);
    const order = step.attacks[0];
    if (order && !this.attacking) {
      this.attacking = true;
      void this.client.attackWithMonster(order.monsterId, order.target).finally(() => {
        this.attacking = false;
      });
    }
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run typecheck && npx vitest run tests/net`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/net tests/net
git commit -m "feat: client interact and stage calls, gate-aware host monsters"
git push origin master
```

---

### Task 7: 사람 같은 봇 (목표·투표·서툰 움직임)

**Files:**
- Modify (전면 교체): `src/game/bots/botBrain.ts`
- Modify: `tests/bots/botMatch.test.ts`

**Interfaces:**
- Consumes: 작업 1 `solidWith`·`findPath(…, isSolid)`, 작업 3 `BOSS_ID`, 작업 4 `tallyPlates`·`votingOpen`, 작업 6 `interact`.
- Produces: `new BotBrain(client, layout, rng = Math.random)`, `pose`, `update(dt)` (기존과 같은 모양).

행동 순서(모험가·배신자 공통, 빙의 중이 아닐 때):
1. 묶였으면 가만히 있는다.
2. 배신자면 준비됐을 때 사람 곁의 좀비에 1~4초 망설인 뒤 빙의한다(공개됐으면 안 함).
3. 14m 안에 보이는 몬스터가 있으면 멈춰서 돌아보고(초당 5라디안), 0.3~0.8초 반응 지연 뒤 0.38~0.65초 간격으로 쏜다. 거리별 명중률 35~85%(빗나가면 서버에 보내지 않는다).
4. 투표: 모험가는 비명을 들으면 소리 난 곳 3m 안의 사람을 25초 동안 의심해 그 사람 발판으로 간다. 누구든(배신자 포함) 다른 사람이 1.5초 넘게 서 있는 발판이 있으면 따라가 선다(자기 발판 제외).
5. 목표: 조각 → 문 1 앞 → 자리별 장치(낮은 자리 번호 동료가 이미 있으면 빈 장치로) → 제단 둘레 자리 → 보스 → 출구.
6. 걷는 속도는 봇마다 0.75~0.95배, 경로 중간점은 ±0.6m 흔들고, 6~12초마다 0.6~1.5초 멈춰 두리번거린다.

- [ ] **Step 1: 테스트를 새 맵으로**

`tests/bots/botMatch.test.ts` 전체를 바꾼다:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGES } from "../../src/game/match/types";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";
import { PracticeSession } from "../../src/net/practice";

const layout = parseLevel(RUINS, TILE_SIZE);
const DT = 0.1;

afterEach(() => {
  vi.useRealTimers();
});

async function runUntilEnd(session: PracticeSession, maxSeconds: number): Promise<number> {
  for (let t = 0; t < maxSeconds; t += DT) {
    vi.advanceTimersByTime(DT * 1000);
    session.update(DT, null);
    await session.world.idle();
    await Promise.resolve();
    if (session.human.state.phase === "ended") return t;
  }
  return Number.POSITIVE_INFINITY;
}

describe("practice session", () => {
  it("fills a room with the player and three bots", async () => {
    const session = new PracticeSession(layout);
    await session.start();
    const match = session.human.state.match!;
    expect(match.players).toEqual(["test-you", "test-bot-1", "test-bot-2", "test-bot-3"]);
    expect(session.human.state.phase).toBe("playing");
    expect(session.human.state.you.role).not.toBeNull();
    session.dispose();
  });

  it("plays a whole match with bots on every seat and gets through the objectives", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const session = new PracticeSession(layout, { autopilot: true });
    await session.start();
    const endedAt = await runUntilEnd(session, 21 * 60);
    session.dispose();

    expect(endedAt).toBeLessThan(21 * 60);
    const match = session.human.state.match!;
    expect(match.phase).toBe("ended");
    expect(match.results).toHaveLength(4);
    expect(STAGES.indexOf(match.objectives.stage)).toBeGreaterThanOrEqual(2);
    console.log(`bot match: ${match.result!.reason} after ${Math.round(endedAt)}s at stage ${match.objectives.stage}`);
  }, 240_000);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/bots`
Expected: FAIL — 지금 봇은 출구로만 가서 `exit_locked`에 막혀 시간 종료(단계 `shards`).

- [ ] **Step 3: 봇 구현**

`src/game/bots/botBrain.ts` 전체를 바꾼다:

```ts
import type { MatchClient, PainEvent } from "../../net/matchClient";
import { EXIT_RADIUS, INTERACT_RANGE, MONSTER_STATS, POSSESS_RANGE, RANGE_SLACK } from "../match/constants";
import { isActive, isBound } from "../match/lifecycle";
import { BOSS_ID } from "../match/objectives";
import type { MonsterState, Pose, Poses, PublicMatch, Vec2 } from "../match/types";
import { distance } from "../match/view";
import { tallyPlates, votingOpen } from "../match/vote";
import { wallDistance } from "../rules/combat";
import { solidWith, spawnPoint, type LevelLayout } from "../rules/levelLayout";
import { EYE_HEIGHT, WALK_SPEED, stepPlayer, type SolidTest } from "../rules/movement";
import { findPath } from "../rules/pathfinding";

const SHOOT_RANGE = 14;
const REPATH_MS = 1000;
const WAYPOINT_REACHED = 0.3;
const TURN_RATE = 5;
const AIM_TOLERANCE = 0.12;
const INTERACT_EVERY_MS = 400;
const REACH = INTERACT_RANGE + RANGE_SLACK - 0.3;
const PAIN_SUSPECT_RADIUS = 3;
const SUSPICION_MS = 25_000;
const FOLLOW_PLATE_AFTER_MS = 1_500;
const GUARD_DISTANCE = 2.5;
const PLATE_STAND = 0.5;

// Timings that make a bot look like a person rather than an aimbot.
const HUMAN = {
  reactMs: [300, 800],
  fireMs: [380, 650],
  pauseEveryMs: [6_000, 12_000],
  pauseMs: [600, 1_500],
  hesitateMs: [1_000, 4_000],
  pathJitter: 0.6,
  speed: [0.75, 0.95],
} as const;

interface Goal {
  at: Vec2;
  // Where to press E once close enough; null when there is nothing to use.
  useAt: Vec2 | null;
  escape: boolean;
  // Close enough to stop walking.
  near: number;
}

function yawTo(from: Vec2, to: Vec2): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function angleBetween(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export class BotBrain {
  pose: Pose | null = null;
  private path: Vec2[] = [];
  private pathGoal: Vec2 | null = null;
  private pathAt = Number.NEGATIVE_INFINITY;
  private busy = false;
  private solid: SolidTest;
  private gatesKey = "";
  private readonly speed: number;
  private target: { id: string; readyAt: number } | null = null;
  private nextShotAt = 0;
  private nextInteractAt = 0;
  private pauseUntil = 0;
  private nextPauseAt: number | null = null;
  private possessAt: number | null = null;
  private suspect: { account: string; until: number } | null = null;
  private readonly plateSeen = new Map<number, number>();

  constructor(
    private readonly client: MatchClient,
    private readonly layout: LevelLayout,
    private readonly rng: () => number = Math.random,
  ) {
    this.solid = solidWith(layout, []);
    this.speed = WALK_SPEED * this.between(HUMAN.speed);
    client.onPain((e) => this.hearPain(e));
  }

  update(dt: number): void {
    const { phase, match, you } = this.client.state;
    if (phase !== "playing" || !match) return;
    const me = this.client.account;
    if (!this.pose) {
      const spot = spawnPoint(this.layout, Math.max(0, match.players.indexOf(me)));
      this.pose = { x: spot.x, z: spot.z, yaw: 0 };
    }
    if (!isActive(match, me)) return;
    this.refreshSolid(match);

    const now = this.client.serverNow();
    const traitor = you.role === "traitor";
    if (traitor && you.possession) {
      this.driveMonster(match, you.possession.monsterId, dt, now);
      return;
    }
    if (!isBound(match, me, now)) {
      if (traitor) this.considerPossessing(match, now);
      this.act(match, dt, now, traitor);
    }
    if (!this.client.state.you.possession) this.client.reportPose(this.pose);
  }

  private act(match: PublicMatch, dt: number, now: number, traitor: boolean): void {
    if (this.fight(match, dt, now)) return;
    const plate = this.votePlate(match, now, traitor);
    if (plate) {
      if (distance(this.pose!, plate) > PLATE_STAND) this.walkTo(plate, dt, now);
      else this.lookAround(dt);
      return;
    }
    const goal = this.goal(match, now);
    if (!goal) return;
    const pose = this.pose!;
    if (goal.useAt && distance(pose, goal.useAt) <= REACH && now >= this.nextInteractAt) {
      this.nextInteractAt = now + INTERACT_EVERY_MS;
      this.run(() => this.client.interact());
    }
    const d = distance(pose, goal.at);
    if (goal.escape && d <= EXIT_RADIUS * 0.8) {
      this.run(() => this.client.escape());
      return;
    }
    if (d <= goal.near || this.pausing(now)) {
      this.lookAround(dt);
      return;
    }
    this.walkTo(goal.at, dt, now);
  }

  // Stops to turn toward a visible monster and shoots after a human reaction time, missing now and then.
  private fight(match: PublicMatch, dt: number, now: number): boolean {
    const pose = this.pose!;
    const seen = this.nearestMonster(match, pose, SHOOT_RANGE, true, () => true);
    if (!seen) {
      this.target = null;
      return false;
    }
    if (!this.target || this.target.id !== seen.id) {
      this.target = { id: seen.id, readyAt: now + this.between(HUMAN.reactMs) };
    }
    const aim = yawTo(pose, seen.monster);
    this.turnToward(aim, dt);
    if (now < this.target.readyAt || now < this.nextShotAt) return true;
    if (Math.abs(angleBetween(this.pose!.yaw, aim)) > AIM_TOLERANCE) return true;
    this.nextShotAt = now + this.between(HUMAN.fireMs);
    const hitChance = Math.min(0.85, Math.max(0.35, 0.9 - seen.distance * 0.04));
    if (this.rng() < hitChance) this.run(() => this.client.fireAtMonster(seen.id));
    return true;
  }

  private goal(match: PublicMatch, now: number): Goal | null {
    const o = match.objectives;
    const level = this.layout;
    const pose = this.pose!;
    switch (o.stage) {
      case "shards": {
        let best: Vec2 | null = null;
        for (let i = 0; i < level.shards.length; i++) {
          const shard = level.shards[i];
          if (!o.shards[i] && (best === null || distance(pose, shard) < distance(pose, best))) best = shard;
        }
        if (best) return { at: best, useAt: best, escape: false, near: 0.8 };
        const gate = level.gates.find((g) => g.n === 1);
        const spot = gate ? this.approach(gate) : null;
        return gate && spot ? { at: spot, useAt: gate, escape: false, near: 0.4 } : null;
      }
      case "devices": {
        const i = this.deviceIndex(match);
        const device = level.devices[i];
        if (!device) return null;
        return { at: device, useAt: o.devices[i] <= now ? device : null, escape: false, near: 1.2 };
      }
      case "seal": {
        const altar = level.altar;
        if (!altar) return null;
        return { at: this.guardSpot(match, altar), useAt: o.seal.lastAt === null ? altar : null, escape: false, near: 0.8 };
      }
      case "boss": {
        const boss = match.monsters[BOSS_ID];
        return boss?.alive ? { at: boss, useAt: null, escape: false, near: 6 } : null;
      }
      case "exit": {
        const exit = level.exits[0];
        return exit ? { at: exit, useAt: null, escape: true, near: 0 } : null;
      }
    }
  }

  // A floor spot beside a closed gate, nudged toward it, that this bot can walk to.
  private approach(gate: Vec2): Vec2 | null {
    const t = this.layout.tileSize;
    const sides = [{ x: -t, z: 0 }, { x: t, z: 0 }, { x: 0, z: -t }, { x: 0, z: t }];
    for (const s of sides) {
      const side = { x: gate.x + s.x, z: gate.z + s.z };
      if (this.solid(side.x, side.z)) continue;
      const spot = { x: side.x - s.x * 0.3, z: side.z - s.z * 0.3 };
      if (findPath(this.layout, this.pose!, spot, this.solid)) return spot;
    }
    return null;
  }

  // My device is picked by seat. If a teammate with a lower seat already stands at it and the other is free, take the other.
  private deviceIndex(match: PublicMatch): number {
    const devices = this.layout.devices;
    const me = this.client.account;
    const seat = match.players.indexOf(me);
    const poses = this.allPoses();
    const standing = (i: number) => match.players.filter((p) => {
      const pose = poses[p];
      return p !== me && isActive(match, p) && !!pose && distance(pose, devices[i]) <= 4;
    });
    const mine = seat % devices.length;
    const other = (mine + 1) % devices.length;
    const takenByLower = standing(mine).some((p) => match.players.indexOf(p) < seat);
    return takenByLower && standing(other).length === 0 ? other : mine;
  }

  private guardSpot(match: PublicMatch, altar: Vec2): Vec2 {
    const seat = Math.max(0, match.players.indexOf(this.client.account));
    const angle = (seat * Math.PI) / 2;
    const spot = { x: altar.x + Math.cos(angle) * GUARD_DISTANCE, z: altar.z + Math.sin(angle) * GUARD_DISTANCE };
    return this.solid(spot.x, spot.z) ? altar : spot;
  }

  private votePlate(match: PublicMatch, now: number, traitor: boolean): Vec2 | null {
    const me = this.client.account;
    if (!votingOpen(match, now)) {
      this.suspect = null;
      this.plateSeen.clear();
      return null;
    }
    if (this.suspect && (now > this.suspect.until || !isActive(match, this.suspect.account))) this.suspect = null;

    // Someone else holding a plate for a moment draws the others in, like answering a call.
    let follow: number | null = null;
    for (const tally of tallyPlates(match, this.allPoses(), this.layout.plates)) {
      if (!tally.voters.some((v) => v !== me)) {
        this.plateSeen.delete(tally.plate);
        continue;
      }
      const since = this.plateSeen.get(tally.plate) ?? now;
      this.plateSeen.set(tally.plate, since);
      if (follow === null && tally.accused !== me && now - since >= FOLLOW_PLATE_AFTER_MS) follow = tally.plate;
    }
    if (!traitor && this.suspect) {
      const plate = this.layout.plates[match.players.indexOf(this.suspect.account)];
      if (plate) return plate;
    }
    return follow === null ? null : (this.layout.plates[follow] ?? null);
  }

  private hearPain(e: PainEvent): void {
    const { match, you, poses } = this.client.state;
    if (!match || you.role !== "adventurer") return;
    const me = this.client.account;
    let best: { account: string; d: number } | null = null;
    for (const account of match.players) {
      const pose = account === me ? null : poses[account];
      if (!pose || !isActive(match, account)) continue;
      const d = distance(pose, e);
      if (d <= PAIN_SUSPECT_RADIUS && (!best || d < best.d)) best = { account, d };
    }
    if (best) this.suspect = { account: best.account, until: this.client.serverNow() + SUSPICION_MS };
  }

  private considerPossessing(match: PublicMatch, now: number): void {
    const { you } = this.client.state;
    const me = this.client.account;
    if (match.revealed === me || you.possessReadyAt === null || now < you.possessReadyAt) {
      this.possessAt = null;
      return;
    }
    const pick = this.nearestMonster(match, this.pose!, POSSESS_RANGE - 1, false,
      (m) => m.kind !== "boss" && this.someoneNear(match, m, 10));
    if (!pick) return;
    if (this.possessAt === null) {
      this.possessAt = now + this.between(HUMAN.hesitateMs);
      return;
    }
    if (now < this.possessAt) return;
    this.possessAt = null;
    this.run(() => this.client.possess(pick.id));
  }

  private someoneNear(match: PublicMatch, point: Vec2, radius: number): boolean {
    const me = this.client.account;
    return match.players.some((p) => {
      const pose = this.client.state.poses[p];
      return p !== me && isActive(match, p) && !!pose && distance(pose, point) <= radius;
    });
  }

  private driveMonster(match: PublicMatch, monsterId: string, dt: number, now: number): void {
    const monster = match.monsters[monsterId];
    if (!monster || !monster.alive) return;
    const stats = MONSTER_STATS[monster.kind];
    const me = this.client.account;
    let best: { account: string; pose: Pose; d: number } | null = null;
    for (const account of match.players) {
      const pose = this.client.state.poses[account];
      if (account === me || !pose || !isActive(match, account)) continue;
      const d = distance(pose, monster);
      if (!best || d < best.d) best = { account, pose, d };
    }
    if (!best) return;
    const yaw = yawTo(monster, best.pose);
    if (best.d > stats.range * 0.8) {
      const moved = stepPlayer({ x: monster.x, z: monster.z, yaw }, { forward: 1, strafe: 0 }, dt, this.solid, stats.speed * 1.2);
      this.client.reportMonsters([{ id: monsterId, x: moved.x, z: moved.z, yaw }]);
    } else if (now >= monster.attackReadyAt) {
      const victim = best.account;
      this.run(() => this.client.attackWithMonster(monsterId, victim));
    }
  }

  private nearestMonster(
    match: PublicMatch, from: Vec2, range: number, mustSee: boolean, accept: (m: MonsterState) => boolean,
  ): { id: string; monster: MonsterState; distance: number } | null {
    let best: { id: string; monster: MonsterState; distance: number } | null = null;
    for (const [id, monster] of Object.entries(match.monsters)) {
      if (!monster.alive || monster.possessed || !accept(monster)) continue;
      const d = distance(from, monster);
      if (d > range || (best && d >= best.distance)) continue;
      if (mustSee && !this.canSee(from, monster, d)) continue;
      best = { id, monster, distance: d };
    }
    return best;
  }

  private canSee(from: Vec2, to: Vec2, d: number): boolean {
    if (d < 0.01) return true;
    const ray = { ox: from.x, oy: EYE_HEIGHT, oz: from.z, dx: (to.x - from.x) / d, dy: 0, dz: (to.z - from.z) / d };
    return wallDistance(ray, this.solid, d, this.layout.tileSize) >= d;
  }

  private walkTo(goal: Vec2, dt: number, now: number): void {
    const pose = this.pose!;
    const stale = !this.pathGoal || distance(this.pathGoal, goal) > 1 || now - this.pathAt > REPATH_MS;
    if (stale || this.path.length === 0) {
      this.path = this.wobble(findPath(this.layout, pose, goal, this.solid) ?? []);
      this.pathGoal = { x: goal.x, z: goal.z };
      this.pathAt = now;
    }
    while (this.path.length > 0 && distance(pose, this.path[0]) < WAYPOINT_REACHED) this.path.shift();
    const next = this.path[0];
    if (!next) return;
    const heading = yawTo(pose, next);
    const speed = Math.min(this.speed, distance(pose, next) / Math.max(dt, 1e-3));
    const moved = stepPlayer({ x: pose.x, z: pose.z, yaw: heading }, { forward: 1, strafe: 0 }, dt, this.solid, speed);
    this.pose = { x: moved.x, z: moved.z, yaw: pose.yaw };
    this.turnToward(heading, dt);
  }

  // Shifts the in-between waypoints a little so bots do not walk the same perfect line.
  private wobble(path: { x: number; z: number }[]): Vec2[] {
    return path.map((p, i) => {
      if (i === path.length - 1) return p;
      const moved = {
        x: p.x + (this.rng() - 0.5) * 2 * HUMAN.pathJitter,
        z: p.z + (this.rng() - 0.5) * 2 * HUMAN.pathJitter,
      };
      return this.solid(moved.x, moved.z) ? p : moved;
    });
  }

  private pausing(now: number): boolean {
    if (this.nextPauseAt === null) this.nextPauseAt = now + this.between(HUMAN.pauseEveryMs);
    if (now >= this.nextPauseAt) {
      this.pauseUntil = now + this.between(HUMAN.pauseMs);
      this.nextPauseAt = this.pauseUntil + this.between(HUMAN.pauseEveryMs);
    }
    return now < this.pauseUntil;
  }

  private lookAround(dt: number): void {
    this.pose!.yaw += (this.rng() - 0.5) * dt * 3;
  }

  private turnToward(yaw: number, dt: number): void {
    const pose = this.pose!;
    const step = TURN_RATE * dt;
    const d = angleBetween(pose.yaw, yaw);
    pose.yaw += Math.max(-step, Math.min(step, d));
  }

  private refreshSolid(match: PublicMatch): void {
    const key = match.objectives.gates.join(",");
    if (key === this.gatesKey) return;
    this.gatesKey = key;
    this.solid = solidWith(this.layout, match.objectives.gates);
    this.path = [];
  }

  private allPoses(): Poses {
    const poses: Poses = { ...this.client.state.poses };
    if (this.pose) poses[this.client.account] = this.pose;
    return poses;
  }

  private between(range: readonly [number, number]): number {
    return range[0] + this.rng() * (range[1] - range[0]);
  }

  // Sends one action at a time; skips the action while an earlier one is pending.
  private run(action: () => Promise<unknown>): boolean {
    if (this.busy) return false;
    this.busy = true;
    void action().finally(() => {
      this.busy = false;
    });
    return true;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/bots`
Expected: PASS. 로그에 `bot match: <reason> after <N>s at stage <stage>`가 찍힌다. 단계가 `seal` 이상이어야 한다.
막히면(시간 종료, 단계 `shards`/`devices`) 로그를 보고 봇의 목표 선택을 고친다. 흔한 원인: 문 앞 자리(`approach`)가 닿지 않음, 장치 나누기가 한쪽으로 몰림, 사격 대상이 벽 뒤.

- [ ] **Step 5: 전체 확인과 커밋**

Run: `npm run typecheck && npm test`
Expected: 전부 PASS.

```bash
git add src/game/bots tests/bots
git commit -m "feat: bots that follow the objectives, vote on plates and move like people"
git push origin master
```

---

### Task 8: 화면 (목표물·보스·표시·조작·HUD)

**Files:**
- Create: `src/game/render/names.ts`, `src/game/render/ObjectiveProps.ts`
- Modify (전면 교체): `src/game/render/MonsterActor.ts`, `src/game/render/RemotePlayerActor.ts`, `src/game/render/MatchView.ts`, `src/ui/Hud.tsx`
- Modify: `src/game/render/skinned.ts`, `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: 작업 1~6 전부.
- Produces: `HudState`에 `objective`, `interactHint`, `plate`, `plateLockedMs`, `lastVote`, `boundMs`, `revealed`, `sealed`; `MatchDebugHandle`에 `interact()`, `setStage(stage)`, `layout()`. 조작: E 상호작용, Q 빙의, R 해제, F 탈출, 클릭 사격/공격.

- [ ] **Step 1: 이름 표시**

`src/game/render/names.ts`:

```ts
export function displayName(account: string, me: string): string {
  if (account === me) return "나";
  const bot = /^test-bot-(\d+)$/.exec(account);
  if (bot) return `봇 ${bot[1]}`;
  return account.length > 12 ? `${account.slice(0, 11)}…` : account;
}
```

- [ ] **Step 2: 동작 전환기에서 현재 동작 읽기**

`src/game/render/skinned.ts`의 `ActionBlender`에 더한다:

```ts
  get active(): THREE.AnimationAction {
    return this.current;
  }
```

- [ ] **Step 3: 몬스터 (공격 동작, 보스 모습)**

`src/game/render/MonsterActor.ts` 전체를 바꾼다:

```ts
import * as THREE from "three";
import type { MonsterState } from "../match/types";
import { ActionBlender, clipByName, ownMaterials, skinnedHeight } from "./skinned";

const HIT_FLASH_SECONDS = 0.08;
const FOLLOW_RATE = 12;

export interface MonsterLook { height: number; tint: number | null }
const ZOMBIE_LOOK: MonsterLook = { height: 1.8, tint: null };

export class MonsterActor {
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly attack: THREE.AnimationAction;
  private readonly death: THREE.AnimationAction;
  private readonly blender: ActionBlender;
  private readonly materials: THREE.MeshStandardMaterial[];
  private readonly attackSeconds: number;
  private flashLeft = 0;
  private attackLeft = 0;
  private lastHp: number | null = null;
  private lastAttackReadyAt: number | null = null;
  private dead = false;
  private placed = false;

  constructor(readonly id: string, readonly object: THREE.Object3D, clips: THREE.AnimationClip[], look: MonsterLook = ZOMBIE_LOOK) {
    object.scale.setScalar(look.height / skinnedHeight(object));
    this.materials = ownMaterials(object);
    if (look.tint !== null) {
      const tint = new THREE.Color(look.tint);
      for (const m of this.materials) m.color.multiply(tint);
    }
    this.mixer = new THREE.AnimationMixer(object);
    this.idle = this.mixer.clipAction(clipByName(clips, "Z_Idle"));
    this.walk = this.mixer.clipAction(clipByName(clips, "Z_Walk_InPlace"));
    this.attack = this.mixer.clipAction(clipByName(clips, "Z_Attack"));
    this.attack.setLoop(THREE.LoopOnce, 1);
    this.attackSeconds = this.attack.getClip().duration;
    this.death = this.mixer.clipAction(clipByName(clips, "Z_FallingBack"));
    this.death.setLoop(THREE.LoopOnce, 1);
    this.death.clampWhenFinished = true;
    this.blender = new ActionBlender(this.idle);
  }

  sync(state: MonsterState, dt: number, hidden: boolean): void {
    const p = this.object.position;
    if (!this.placed) {
      p.set(state.x, 0, state.z);
      this.placed = true;
    }
    const k = 1 - Math.exp(-dt * FOLLOW_RATE);
    const dx = state.x - p.x;
    const dz = state.z - p.z;
    p.x += dx * k;
    p.z += dz * k;
    // State yaw uses the camera convention; the model faces +z.
    this.object.rotation.y = state.yaw + Math.PI;

    if (this.lastHp !== null && state.hp < this.lastHp) this.flashLeft = HIT_FLASH_SECONDS;
    this.lastHp = state.hp;
    // Every attack pushes attackReadyAt forward, so a jump in it means the monster just swung.
    if (this.lastAttackReadyAt !== null && state.attackReadyAt > this.lastAttackReadyAt && state.alive) {
      this.attackLeft = this.attackSeconds;
      if (this.blender.active === this.attack) this.attack.reset().play();
      else this.blender.fadeTo(this.attack, 0.08);
    }
    this.lastAttackReadyAt = state.attackReadyAt;
    this.attackLeft = Math.max(0, this.attackLeft - dt);

    if (!state.alive && !this.dead) {
      this.dead = true;
      this.blender.fadeTo(this.death, 0.1);
    } else if (!this.dead && this.attackLeft === 0) {
      this.blender.fadeTo(Math.hypot(dx, dz) > 0.03 ? this.walk : this.idle);
    }

    this.flashLeft = Math.max(0, this.flashLeft - dt);
    const glow = this.flashLeft > 0 ? 1.5 : 0;
    for (const m of this.materials) m.emissive.setRGB(glow, glow * 0.2, glow * 0.2);
    this.object.visible = !hidden;
    this.mixer.update(dt);
  }
}
```

- [ ] **Step 4: 다른 플레이어 (공개·묶임 표시)**

`src/game/render/RemotePlayerActor.ts`에서 (`import * as THREE from "three";`는 이미 있다):
- 클래스 필드에 더한다:

```ts
  private readonly revealMark: THREE.Mesh;
  private readonly boundMark: THREE.Mesh;
```

- 생성자를 바꾼다:

```ts
  constructor(readonly account: string, model: PlayerModel | null) {
    this.body = model?.object ?? placeholderBody();
    this.object = new THREE.Group();
    this.revealMark = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 12), new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
    this.revealMark.rotation.x = Math.PI;
    this.revealMark.position.y = 2.25;
    this.revealMark.visible = false;
    this.boundMark = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffb35a }));
    this.boundMark.rotation.x = Math.PI / 2;
    this.boundMark.position.y = 1.0;
    this.boundMark.visible = false;
    this.object.add(this.body, this.revealMark, this.boundMark);
    this.animated = model ? RemotePlayerActor.animate(model) : null;
    this.object.traverse((o) => {
      o.frustumCulled = false;
    });
    this.object.visible = false;
  }

  // A red marker over an exposed traitor, a rope ring around a bound player.
  mark(revealed: boolean, bound: boolean): void {
    this.revealMark.visible = revealed && !this.dead;
    this.boundMark.visible = bound && !this.dead;
  }
```

- [ ] **Step 5: 목표물 그리기**

`src/game/render/ObjectiveProps.ts`:

```ts
import * as THREE from "three";
import { PLATE_RADIUS, SEAL_DURATION_MS, SEAL_RADIUS } from "../match/constants";
import { isActive } from "../match/lifecycle";
import type { PublicMatch } from "../match/types";
import type { LevelLayout } from "../rules/levelLayout";

const GATE_HEIGHT = 3.95;
const SHARD_COLOR = 0x46d8ff;
const DEVICE_ON = 0x5dff8a;
const DEVICE_OFF = 0xff5a3a;
const PLATE_IDLE = 0x3a6f86;
const PLATE_HOLD = 0xffb35a;
const PLATE_LOCKED = 0x2a2a2a;
const PLATE_GUILTY = 0xff4d3d;

interface PlateView { material: THREE.MeshStandardMaterial; label: THREE.Sprite; name: string }
interface DeviceView { lamp: THREE.MeshStandardMaterial; light: THREE.PointLight }

function setLabel(sprite: THREE.Sprite, text: string): void {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 8, 256, 48);
    ctx.fillStyle = "#f0d9a8";
    ctx.fillText(text, 128, 32);
  }
  const material = sprite.material;
  material.map?.dispose();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  material.map = texture;
  material.needsUpdate = true;
  sprite.visible = text.length > 0;
}

export class ObjectiveProps {
  private readonly gates = new Map<number, THREE.Object3D>();
  private readonly shards: THREE.Object3D[] = [];
  private readonly devices: DeviceView[] = [];
  private readonly plates: PlateView[] = [];
  private readonly altarGlow = new THREE.MeshStandardMaterial({ color: 0x3a2a18, emissive: 0xffa040, emissiveIntensity: 0 });
  private readonly guardRing: THREE.Mesh;
  private time = 0;

  constructor(scene: THREE.Scene, layout: LevelLayout) {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4f463b, roughness: 0.95 });
    const rune = new THREE.MeshStandardMaterial({ color: 0x10202a, emissive: SHARD_COLOR, emissiveIntensity: 0.7 });
    const t = layout.tileSize;

    for (const gate of layout.gates) {
      const door = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(t, GATE_HEIGHT, t), stone);
      slab.position.y = GATE_HEIGHT / 2;
      door.add(slab);
      // One glowing rune band per gate number, on all four faces.
      for (let i = 0; i < gate.n; i++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(t + 0.02, 0.12, 0.5), rune);
        band.position.set(0, 1.6 + i * 0.35, 0);
        const cross = band.clone();
        cross.rotation.y = Math.PI / 2;
        door.add(band, cross);
      }
      door.position.set(gate.x, 0, gate.z);
      scene.add(door);
      this.gates.set(gate.n, door);
    }

    for (const at of layout.shards) {
      const group = new THREE.Group();
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28),
        new THREE.MeshStandardMaterial({ color: 0x0c2630, emissive: SHARD_COLOR, emissiveIntensity: 1.4 }),
      );
      crystal.position.y = 1.1;
      const light = new THREE.PointLight(SHARD_COLOR, 6, 6, 2);
      light.position.y = 1.2;
      group.add(crystal, light);
      group.position.set(at.x, 0, at.z);
      scene.add(group);
      this.shards.push(group);
    }

    for (const at of layout.devices) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 12), stone);
      base.position.set(at.x, 0.6, at.z);
      const lamp = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: DEVICE_OFF, emissiveIntensity: 1 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), lamp);
      bulb.position.set(at.x, 1.4, at.z);
      const light = new THREE.PointLight(DEVICE_OFF, 5, 7, 2);
      light.position.set(at.x, 1.8, at.z);
      scene.add(base, bulb, light);
      this.devices.push({ lamp, light });
    }

    this.guardRing = new THREE.Mesh(
      new THREE.RingGeometry(SEAL_RADIUS - 0.08, SEAL_RADIUS, 64),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    this.guardRing.rotation.x = -Math.PI / 2;
    this.guardRing.visible = false;
    const altar = layout.altar;
    if (altar) {
      const block = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.9, 16), stone);
      block.position.set(altar.x, 0.45, altar.z);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 16), this.altarGlow);
      top.position.set(altar.x, 0.93, altar.z);
      this.guardRing.position.set(altar.x, 0.03, altar.z);
      scene.add(block, top, this.guardRing);
    }

    for (const at of layout.plates) {
      const material = new THREE.MeshStandardMaterial({ color: 0x151515, emissive: PLATE_IDLE, emissiveIntensity: 0.8 });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(PLATE_RADIUS, 32), material);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(at.x, 0.02, at.z);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
      label.position.set(at.x, 2.1, at.z);
      label.scale.set(2.4, 0.6, 1);
      label.visible = false;
      scene.add(disc, label);
      this.plates.push({ material, label, name: "" });
    }
  }

  // names[i] is the display name for match.players[i].
  update(match: PublicMatch, now: number, dt: number, names: string[]): void {
    this.time += dt;
    const o = match.objectives;
    for (const [n, door] of this.gates) door.visible = !o.gates.includes(n);
    this.shards.forEach((shard, i) => {
      shard.visible = !o.shards[i];
      const crystal = shard.children[0];
      crystal.rotation.y = this.time * 1.5;
      crystal.position.y = 1.1 + Math.sin(this.time * 2 + i) * 0.08;
    });
    this.devices.forEach((device, i) => {
      const on = o.gates.includes(2) || (o.stage === "devices" && o.devices[i] > now);
      const color = on ? DEVICE_ON : DEVICE_OFF;
      device.lamp.emissive.setHex(color);
      device.light.color.setHex(color);
    });
    this.guardRing.visible = o.stage === "seal" && o.seal.lastAt !== null;
    this.altarGlow.emissiveIntensity = o.gates.includes(3) ? 2.3
      : o.stage === "seal" ? 0.3 + (o.seal.progressMs / SEAL_DURATION_MS) * 2 : 0.1;

    const locked = match.revealed === null && match.vote.lockedUntil > now;
    this.plates.forEach((plate, i) => {
      const accused = match.players[i];
      const name = accused ? (names[i] ?? "") : "";
      if (name !== plate.name) {
        plate.name = name;
        setLabel(plate.label, name);
      }
      const holding = match.vote.plate === i;
      const color = accused && match.revealed === accused ? PLATE_GUILTY
        : !accused || !isActive(match, accused) || match.revealed !== null || locked ? PLATE_LOCKED
          : holding ? PLATE_HOLD : PLATE_IDLE;
      plate.material.emissive.setHex(color);
      plate.material.emissiveIntensity = holding ? 1.2 + Math.sin(this.time * 8) * 0.4 : 0.8;
    });
  }
}
```

- [ ] **Step 6: 경기 화면**

`src/game/render/MatchView.ts` 전체를 바꾼다:

```ts
import * as THREE from "three";
import type { ClientPhase, ClientState, MatchClient } from "../../net/matchClient";
import { ModelLibrary } from "../assets/ModelLibrary";
import {
  AKM_FIRE_INTERVAL_MS, AKM_RANGE, DEVICE_COUNT, EXIT_RADIUS, MONSTER_STATS, POSSESS_RANGE, RANGE_SLACK,
  SEAL_DURATION_MS, SEAL_RADIUS, SHARD_COUNT,
} from "../match/constants";
import { isActive, isBound } from "../match/lifecycle";
import { BOSS_ID, interactableNear, type Interactable } from "../match/objectives";
import type { MatchResult, MonsterKind, PlayerResult, Pose, Possession, PublicMatch, Stage } from "../match/types";
import { distance } from "../match/view";
import { tallyPlates } from "../match/vote";
import { ZOMBIE_HEIGHT, ZOMBIE_RADIUS, resolveShot, type HitTarget, type Ray3 } from "../rules/combat";
import { RUINS, TILE_SIZE, parseLevel, solidWith, spawnPoint, type LevelLayout } from "../rules/levelLayout";
import { EYE_HEIGHT, applyLook, stepPlayer, type SolidTest } from "../rules/movement";
import { FpsInput } from "./FpsInput";
import { MonsterActor, type MonsterLook } from "./MonsterActor";
import { ObjectiveProps } from "./ObjectiveProps";
import { RemotePlayerActor, type PlayerStatus } from "./RemotePlayerActor";
import { Viewmodel } from "./Viewmodel";
import { displayName } from "./names";
import { playScream } from "./scream";

export const LOOK_SENSITIVITY = 0.0022;

// Corrections for the Decrepit Dungeon kit's own pivots and facing, tuned by eye in Plan 1.
// Wall_A is authored running along z, so it needs a quarter turn to span its edge.
export const KIT = { wallYawOffset: Math.PI / 2, wallInset: 0, ceilingYOffset: 0 };

const KIT_MODELS = ["dd_floor_a", "dd_ceiling", "dd_wall_a", "dd_pillar_a", "dd_torch", "dd_barrel", "chest_closed"];
// Players use a stand-in body until a character asset that fits (and takes costumes) is chosen.
export const MATCH_MODELS = [...KIT_MODELS, "wpn_akm", "zombie1"];

const MONSTER_EYE = 1.5;
const POSSESSED_SPEED_FACTOR = 1.3;
const HUD_INTERVAL_MS = 100;
// The boss is the zombie model, grown and reddened, until it gets its own model.
const BOSS_LOOK: MonsterLook = { height: 3, tint: 0xd07a7a };
const HIT_SHAPE: Record<MonsterKind, { radius: number; height: number }> = {
  zombie: { radius: ZOMBIE_RADIUS, height: ZOMBIE_HEIGHT },
  boss: { radius: 0.8, height: 3 },
};
const INTERACT_LABEL: Record<Interactable["kind"], string> = {
  shard: "E: 룬 조각 줍기",
  gate: "E: 룬 조각 끼우기",
  device: "E: 장치 작동",
  altar: "E: 봉인 해제 시작",
};

export interface ObjectiveHud {
  stage: Stage;
  shards: number;
  shardTotal: number;
  devicesOn: number;
  deviceTotal: number;
  sealStarted: boolean;
  sealMs: number;
  sealTotalMs: number;
  guarded: boolean;
  bossHp: number | null;
  bossMaxHp: number;
}

export interface PlateHud { accused: string; votes: number; needed: number; heldMs: number }

export interface HudState {
  phase: ClientPhase;
  role: "adventurer" | "traitor" | null;
  hp: number | null;
  timeLeftMs: number | null;
  alive: boolean;
  escaped: boolean;
  possession: { monsterId: string; remainingMs: number } | null;
  possessReadyInMs: number | null;
  canPossess: boolean;
  nearExit: boolean;
  players: number;
  painAt: number | null;
  error: { code: string; at: number } | null;
  result: MatchResult | null;
  results: PlayerResult[] | null;
  objective: ObjectiveHud | null;
  interactHint: string | null;
  plate: PlateHud | null;
  plateLockedMs: number | null;
  lastVote: { name: string; guilty: boolean; ageMs: number } | null;
  boundMs: number | null;
  revealed: string | null;
  sealed: boolean;
}

export interface MatchViewOptions {
  onProgress?: (done: number, total: number) => void;
  onFrame?: (dt: number, ownPose: Pose | null) => void;
}

export interface MatchDebugHandle {
  pose(): { x: number; z: number; yaw: number; pitch: number };
  setPose(p: { x: number; z: number; yaw: number; pitch?: number }): void;
  stats(): { triangles: number; calls: number };
  hud(): HudState | null;
  state(): ClientState;
  layout(): LevelLayout;
  fire(): Promise<string | null>;
  possessNearest(): Promise<string | null>;
  release(): Promise<string | null>;
  interact(): Promise<string | null>;
  escape(): Promise<string | null>;
  advanceClock(ms: number): Promise<string | null>;
  setStage(stage: Stage): Promise<string | null>;
}

export class MatchView {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  private readonly clock = new THREE.Clock();
  private readonly layout: LevelLayout = parseLevel(RUINS, TILE_SIZE);
  private readonly input: FpsInput;
  private readonly resizeObserver: ResizeObserver;
  private readonly torches: THREE.PointLight[] = [];
  private readonly monsters = new Map<string, MonsterActor>();
  private readonly players = new Map<string, RemotePlayerActor>();
  private readonly hudListeners = new Set<(hud: HudState) => void>();
  private readonly aim = new THREE.Vector3();
  private solid: SolidTest = solidWith(this.layout, []);
  private gatesKey = "";
  private readonly isSolid = (x: number, z: number) => this.solid(x, z);
  private library: ModelLibrary | null = null;
  private props: ObjectiveProps | null = null;
  private viewmodel: Viewmodel | null = null;
  private pose: Pose;
  private yaw = 0;
  private pitch = 0;
  private spawned = false;
  private lastShotAt = Number.NEGATIVE_INFINITY;
  private pendingAction = false;
  private painAt: number | null = null;
  private error: { code: string; at: number } | null = null;
  private lastHud: HudState | null = null;
  private lastHudAt = Number.NEGATIVE_INFINITY;
  private frame = 0;
  private disposed = false;
  private offPain: (() => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly client: MatchClient,
    private readonly options: MatchViewOptions = {},
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.input = new FpsInput(this.renderer.domElement);
    this.pose = { ...this.layout.playerSpawn, yaw: 0 };
    this.scene.background = new THREE.Color(0x050404);
    this.scene.fog = new THREE.FogExp2(0x050404, 0.07);
    this.scene.add(this.camera);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  async start(): Promise<void> {
    const library = await ModelLibrary.load();
    await library.preload(MATCH_MODELS, this.options.onProgress);
    // React StrictMode mounts twice; the first view may be gone by now.
    if (this.disposed) return;
    this.library = library;
    this.buildLevel(library);
    this.addLights();
    this.addExitMarker();
    this.props = new ObjectiveProps(this.scene, this.layout);
    this.viewmodel = new Viewmodel(this.camera, library.instance("wpn_akm"));
    this.offPain = this.client.onPain(() => {
      this.painAt = performance.now();
      playScream();
    });
    this.clock.start();
    this.frame = requestAnimationFrame(this.tick);
  }

  onHud(cb: (hud: HudState) => void): () => void {
    this.hudListeners.add(cb);
    return () => {
      this.hudListeners.delete(cb);
    };
  }

  debugHandle(): MatchDebugHandle {
    return {
      pose: () => ({ ...this.pose, pitch: this.pitch }),
      setPose: (p) => {
        this.pose = { x: p.x, z: p.z, yaw: p.yaw };
        this.yaw = p.yaw;
        this.pitch = p.pitch ?? 0;
        this.spawned = true;
      },
      stats: () => ({ triangles: this.renderer.info.render.triangles, calls: this.renderer.info.render.calls }),
      hud: () => this.lastHud,
      state: () => this.client.state,
      layout: () => this.layout,
      fire: () => {
        const match = this.client.state.match;
        if (!match) return Promise.resolve("not_playing");
        this.placeCamera(match, this.client.state.you.possession);
        return this.shoot(match);
      },
      possessNearest: () => {
        const match = this.client.state.match;
        const id = match ? this.possessCandidate(match) : null;
        return id ? this.client.possess(id) : Promise.resolve("no_monster");
      },
      release: () => this.client.release(),
      interact: () => this.client.interact(),
      escape: () => this.client.escape(),
      advanceClock: (ms) => this.client.advanceClock(ms),
      setStage: (stage) => this.client.setStage(stage),
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.offPain?.();
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hudListeners.clear();
  }

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const state = this.client.state;
    const match = state.match;
    const me = this.client.account;
    const now = this.client.serverNow();

    if (match && !this.spawned && match.players.includes(me)) {
      const spot = spawnPoint(this.layout, match.players.indexOf(me));
      this.pose = { x: spot.x, z: spot.z, yaw: 0 };
      this.spawned = true;
    }
    if (match) this.refreshSolid(match);

    const look = this.input.consumeLook();
    const view = applyLook(this.yaw, this.pitch, look.dx, look.dy, LOOK_SENSITIVITY);
    this.yaw = view.yaw;
    this.pitch = view.pitch;

    const possession = state.you.possession;
    const active = !!match && match.phase === "playing" && isActive(match, me);
    const bound = !!match && isBound(match, me, now);
    const move = this.input.moveInput();
    if (active && possession && match) {
      this.driveMonster(match, possession.monsterId, move, dt);
    } else if (active && !bound) {
      this.pose = stepPlayer({ ...this.pose, yaw: this.yaw }, move, dt, this.isSolid);
    } else if (active) {
      this.pose = { ...this.pose, yaw: this.yaw };
    }
    if (match) this.handleActions(match, state, possession, active, bound);
    if (active && !possession) this.client.reportPose(this.pose);
    this.options.onFrame?.(dt, active ? this.pose : null);
    this.client.tick();

    if (match) {
      this.syncActors(match, state, dt, possession, now);
      this.props?.update(match, now, dt, match.players.map((p) => displayName(p, me)));
      this.placeCamera(match, possession);
    }
    const moving = !bound && (move.forward !== 0 || move.strafe !== 0);
    this.viewmodel?.setVisible(active && !possession);
    this.viewmodel?.update(dt, moving);

    const t = this.clock.elapsedTime;
    this.torches.forEach((light, i) => {
      light.intensity = 25 + Math.sin(t * 9 + i * 1.7) * 3 + Math.sin(t * 23 + i) * 2;
    });

    this.emitHud(match, state, possession, active, bound);
    this.renderer.render(this.scene, this.camera);
  };

  private refreshSolid(match: PublicMatch): void {
    const key = match.objectives.gates.join(",");
    if (key === this.gatesKey) return;
    this.gatesKey = key;
    this.solid = solidWith(this.layout, match.objectives.gates);
  }

  private handleActions(
    match: PublicMatch, state: ClientState, possession: Possession | null, active: boolean, bound: boolean,
  ): void {
    const pressInteract = this.input.consumePress("KeyE");
    const pressPossess = this.input.consumePress("KeyQ");
    const pressEscape = this.input.consumePress("KeyF");
    const pressRelease = this.input.consumePress("KeyR");
    if (!active) return;

    if (possession) {
      if (this.pendingAction) return;
      if (pressRelease) {
        this.perform(() => this.client.release());
        return;
      }
      if (this.input.firing) {
        const victim = this.attackCandidate(match, possession.monsterId);
        if (victim) this.perform(() => this.client.attackWithMonster(possession.monsterId, victim));
      }
      return;
    }

    // Only the body is tied up: a bound traitor can still possess.
    if (!this.pendingAction && pressPossess && state.you.role === "traitor") {
      const id = this.possessCandidate(match);
      if (id) this.perform(() => this.client.possess(id));
      else this.fail("no_monster");
    }
    if (bound) {
      if (pressInteract || pressEscape || this.input.firing) this.fail("bound");
      return;
    }
    if (!this.pendingAction && pressInteract) this.perform(() => this.client.interact());
    if (!this.pendingAction && pressEscape) this.perform(() => this.client.escape());
    if (this.input.firing && this.client.serverNow() - this.lastShotAt >= AKM_FIRE_INTERVAL_MS) {
      void this.shoot(match);
    }
  }

  private shoot(match: PublicMatch): Promise<string | null> {
    this.lastShotAt = this.client.serverNow();
    this.viewmodel?.fire();
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.aim);
    const ray: Ray3 = {
      ox: this.camera.position.x, oy: this.camera.position.y, oz: this.camera.position.z,
      dx: this.aim.x, dy: this.aim.y, dz: this.aim.z,
    };
    const targets: HitTarget[] = [];
    for (const [id, m] of Object.entries(match.monsters)) {
      if (m.alive) targets.push({ id, x: m.x, z: m.z, ...HIT_SHAPE[m.kind], alive: true });
    }
    const hit = resolveShot(ray, targets, this.isSolid, AKM_RANGE, TILE_SIZE);
    if (!hit) return Promise.resolve("miss");
    // Guns only hurt monsters: nobody can shoot another player, the traitor included.
    return this.client.fireAtMonster(hit.id).then((code) => {
      if (code) this.fail(code);
      return code;
    });
  }

  private driveMonster(
    match: PublicMatch, monsterId: string, move: { forward: number; strafe: number }, dt: number,
  ): void {
    const monster = match.monsters[monsterId];
    if (!monster || !monster.alive) return;
    const speed = MONSTER_STATS[monster.kind].speed * POSSESSED_SPEED_FACTOR;
    const next = stepPlayer({ x: monster.x, z: monster.z, yaw: this.yaw }, move, dt, this.isSolid, speed);
    if (next.x === monster.x && next.z === monster.z && Math.abs(this.yaw - monster.yaw) < 1e-3) return;
    this.client.reportMonsters([{ id: monsterId, x: next.x, z: next.z, yaw: this.yaw }]);
  }

  private possessCandidate(match: PublicMatch): string | null {
    let best: { id: string; d: number } | null = null;
    for (const [id, m] of Object.entries(match.monsters)) {
      if (!m.alive || m.possessed || m.kind === "boss") continue;
      const d = distance(this.pose, m);
      if (d <= POSSESS_RANGE && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  }

  private attackCandidate(match: PublicMatch, monsterId: string): string | null {
    const monster = match.monsters[monsterId];
    if (!monster) return null;
    const me = this.client.account;
    const reach = MONSTER_STATS[monster.kind].range + RANGE_SLACK;
    let best: { account: string; d: number } | null = null;
    for (const account of match.players) {
      const p = this.client.state.poses[account];
      if (account === me || !p || !isActive(match, account)) continue;
      const d = distance(p, monster);
      if (d <= reach && (!best || d < best.d)) best = { account, d };
    }
    if (!best) return null;
    return monster.attackReadyAt <= this.client.serverNow() ? best.account : null;
  }

  private perform(action: () => Promise<string | null>): void {
    this.pendingAction = true;
    void action()
      .then((code) => {
        if (code) this.fail(code);
      })
      .finally(() => {
        this.pendingAction = false;
      });
  }

  private fail(code: string): void {
    this.error = { code, at: performance.now() };
  }

  private syncActors(match: PublicMatch, state: ClientState, dt: number, possession: Possession | null, now: number): void {
    const library = this.library;
    if (!library) return;
    for (const [id, m] of Object.entries(match.monsters)) {
      let actor = this.monsters.get(id);
      if (!actor) {
        const look = m.kind === "boss" ? BOSS_LOOK : undefined;
        actor = new MonsterActor(id, library.instance("zombie1"), library.get("zombie1").animations, look);
        this.scene.add(actor.object);
        this.monsters.set(id, actor);
      }
      actor.sync(m, dt, possession?.monsterId === id);
    }

    const me = this.client.account;
    for (const account of match.players) {
      let actor = this.players.get(account);
      if (!actor) {
        actor = new RemotePlayerActor(account, null);
        this.scene.add(actor.object);
        this.players.set(account, actor);
      }
      const status: PlayerStatus = match.dead.includes(account) ? "dead" : match.escaped.includes(account) ? "escaped" : "active";
      // My own body is only drawn while I look out through a monster.
      const pose = account === me ? (possession ? this.pose : null) : (state.poses[account] ?? null);
      actor.sync(pose, status, dt);
      actor.mark(match.revealed === account, isBound(match, account, now));
    }
  }

  private placeCamera(match: PublicMatch, possession: Possession | null): void {
    const monster = possession ? match.monsters[possession.monsterId] : undefined;
    if (monster) this.camera.position.set(monster.x, MONSTER_EYE, monster.z);
    else this.camera.position.set(this.pose.x, EYE_HEIGHT, this.pose.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  private emitHud(
    match: PublicMatch | null, state: ClientState, possession: Possession | null, active: boolean, bound: boolean,
  ): void {
    const now = performance.now();
    if (now - this.lastHudAt < HUD_INTERVAL_MS) return;
    this.lastHudAt = now;
    const me = this.client.account;
    const serverNow = this.client.serverNow();
    const readyAt = state.you.possessReadyAt;
    const possessReadyInMs = readyAt === null ? null : Math.max(0, readyAt - serverNow);
    const exit = this.layout.exits[0];
    const playing = !!match && match.phase === "playing";
    const free = active && !possession && !bound;
    const usable = match && free ? interactableNear(match, this.layout, this.pose, serverNow) : null;
    const last = match?.vote.last ?? null;
    const hud: HudState = {
      phase: state.phase,
      role: state.you.role,
      hp: state.you.hp,
      timeLeftMs: match && playing && match.endsAt !== null ? Math.max(0, match.endsAt - serverNow) : null,
      alive: match ? !match.dead.includes(me) : true,
      escaped: match ? match.escaped.includes(me) : false,
      possession: possession ? { monsterId: possession.monsterId, remainingMs: Math.max(0, possession.endsAt - serverNow) } : null,
      possessReadyInMs,
      canPossess: !!match && active && !possession && state.you.role === "traitor" && match.revealed !== me
        && possessReadyInMs === 0 && this.possessCandidate(match) !== null,
      nearExit: free && !!match && match.objectives.stage === "exit" && !!exit && distance(this.pose, exit) <= EXIT_RADIUS,
      players: match?.players.length ?? 0,
      painAt: this.painAt,
      error: this.error,
      result: match?.result ?? null,
      results: match?.results ?? null,
      objective: match && playing ? this.objectiveHud(match, state, serverNow) : null,
      interactHint: usable ? INTERACT_LABEL[usable.kind] : null,
      plate: match && playing && active && !possession ? this.plateHud(match, state, serverNow) : null,
      plateLockedMs: match && playing && match.revealed === null && match.vote.lockedUntil > serverNow
        ? match.vote.lockedUntil - serverNow : null,
      lastVote: last ? { name: displayName(last.accused, me), guilty: last.guilty, ageMs: serverNow - last.at } : null,
      boundMs: match && bound ? (match.bound[me] ?? serverNow) - serverNow : null,
      revealed: match?.revealed ? displayName(match.revealed, me) : null,
      sealed: !!match && match.revealed === me,
    };
    this.lastHud = hud;
    for (const listener of this.hudListeners) listener(hud);
  }

  private posesWithMine(state: ClientState): Record<string, Pose> {
    return { ...state.poses, [this.client.account]: this.pose };
  }

  private objectiveHud(match: PublicMatch, state: ClientState, now: number): ObjectiveHud {
    const o = match.objectives;
    const altar = this.layout.altar;
    const poses = this.posesWithMine(state);
    const guarded = !!altar && match.players.some((p) => {
      const pose = poses[p];
      return !!pose && isActive(match, p) && distance(pose, altar) <= SEAL_RADIUS;
    });
    const boss = match.monsters[BOSS_ID];
    return {
      stage: o.stage,
      shards: o.shards.filter(Boolean).length,
      shardTotal: SHARD_COUNT,
      devicesOn: o.devices.filter((until) => until > now).length,
      deviceTotal: DEVICE_COUNT,
      sealStarted: o.seal.lastAt !== null,
      sealMs: o.seal.progressMs,
      sealTotalMs: SEAL_DURATION_MS,
      guarded,
      bossHp: boss ? boss.hp : null,
      bossMaxHp: MONSTER_STATS.boss.hp,
    };
  }

  private plateHud(match: PublicMatch, state: ClientState, now: number): PlateHud | null {
    const me = this.client.account;
    const tally = tallyPlates(match, this.posesWithMine(state), this.layout.plates).find((t) => t.voters.includes(me));
    if (!tally) return null;
    const heldMs = match.vote.plate === tally.plate ? Math.max(0, now - match.vote.since) : 0;
    return { accused: displayName(tally.accused, me), votes: tally.votes, needed: tally.needed, heldMs };
  }

  private buildLevel(library: ModelLibrary): void {
    const floorSize = new THREE.Box3().setFromObject(library.get("dd_floor_a").scene).getSize(new THREE.Vector3());
    const kitScale = TILE_SIZE / Math.max(floorSize.x, floorSize.z);
    for (const p of this.layout.placements) {
      const obj = library.instance(p.model);
      obj.scale.setScalar(kitScale);
      let { x, y, z } = p;
      let yaw = p.rotationY;
      if (p.model === "dd_wall_a") {
        x += Math.sin(p.rotationY) * KIT.wallInset;
        z += Math.cos(p.rotationY) * KIT.wallInset;
        yaw += KIT.wallYawOffset;
      }
      if (p.model === "dd_ceiling") y += KIT.ceilingYOffset;
      obj.position.set(x, y, z);
      obj.rotation.y = yaw;
      this.scene.add(obj);
    }
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x8a8298, 0x2a2018, 0.9));
    for (const p of this.layout.placements) {
      if (p.model !== "dd_torch") continue;
      const light = new THREE.PointLight(0xff8a3d, 25, 12, 2);
      light.position.set(p.x, p.y + 0.4, p.z);
      this.scene.add(light);
      this.torches.push(light);
    }
    const lamp = new THREE.SpotLight(0xfff1dc, 90, 24, 0.8, 0.7, 2);
    lamp.position.set(0, 0, 0);
    lamp.target.position.set(0, 0, -1);
    this.camera.add(lamp, lamp.target);
  }

  private addExitMarker(): void {
    for (const exit of this.layout.exits) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(EXIT_RADIUS - 0.25, EXIT_RADIUS, 48),
        new THREE.MeshBasicMaterial({ color: 0x4dff9a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(exit.x, 0.03, exit.z);
      const light = new THREE.PointLight(0x4dff9a, 12, 8, 2);
      light.position.set(exit.x, 1.2, exit.z);
      this.scene.add(ring, light);
    }
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
```

- [ ] **Step 7: HUD**

`src/ui/Hud.tsx` 전체를 바꾼다:

```tsx
import { PLATE_HOLD_MS } from "../game/match/constants";
import type { HudState, ObjectiveHud } from "../game/render/MatchView";

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
  need_shards: "룬 조각 2개가 모두 있어야 해요",
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
      return o.shards < o.shardTotal ? `룬 조각 찾기 ${o.shards}/${o.shardTotal}` : "봉인문 1에 룬 조각 끼우기";
    case "devices":
      return `고대 장치 ${o.devicesOn}/${o.deviceTotal} 켜짐 — 둘을 동시에 켜야 문이 열린다`;
    case "seal":
      if (!o.sealStarted) return "제단에서 봉인 해제 시작";
      return `봉인 해제 ${seconds(o.sealMs)}/${seconds(o.sealTotalMs)}초${o.guarded ? "" : " — 제단 곁을 지키세요!"}`;
    case "boss":
      return o.bossHp === null ? "보스 처치" : `보스 처치 — 체력 ${o.bossHp}/${o.bossMaxHp}`;
    case "exit":
      return "출구로 탈출 (F)";
  }
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
        {hud.timeLeftMs !== null && <span className="timer">{clock(hud.timeLeftMs)}</span>}
      </div>
      {hud.objective && <div className="hud-objective">{objectiveText(hud.objective)}</div>}
      {hud.revealed && <div className="hud-revealed">배신자: {hud.revealed}</div>}
      {hud.role === "traitor" && inside && <div className="hud-possess">{possessionText(hud)}</div>}
      {inside && hud.interactHint && <div className="hud-prompt">{hud.interactHint}</div>}
      {hud.nearExit && <div className="hud-prompt low">F: 탈출</div>}
      {inside && hud.plate && (
        <div className="hud-vote">
          {hud.plate.accused} 지목 발판 · {hud.plate.votes}/{hud.plate.needed}명
          {hud.plate.votes >= hud.plate.needed && ` · ${seconds(Math.max(0, PLATE_HOLD_MS - hud.plate.heldMs))}초`}
        </div>
      )}
      {inside && !hud.plate && hud.plateLockedMs !== null && (
        <div className="hud-vote dim">발판 잠김 {seconds(hud.plateLockedMs)}초</div>
      )}
      {vote && (
        <div className={`hud-banner ${vote.guilty ? "guilty" : "innocent"}`}>
          {vote.guilty
            ? `${vote.name}은(는) 배신자였다! 빙의가 봉인됐다`
            : `${vote.name}은(는) 무고했다 — 20초 동안 묶인다`}
        </div>
      )}
      {hud.boundMs !== null && <div className="hud-bound">묶여 있음 {seconds(hud.boundMs)}초</div>}
      {!hud.alive && <div className="hud-prompt">쓰러졌습니다 — 결과를 기다리는 중</div>}
      {hud.escaped && <div className="hud-prompt">탈출했습니다 — 결과를 기다리는 중</div>}
      {pain && <div className="pain">가까이서 비명이 들렸다!</div>}
      {error && <div className="hud-error">{error}</div>}
      {inside && !hud.possession && <div className="crosshair" />}
      <div className="hint">
        클릭해서 조작 · WASD 이동 · 클릭 사격 · E 상호작용 · F 탈출{hud.role === "traitor" ? " · Q 빙의 · R 해제" : ""} · 발판에 모여 배신자 지목
      </div>
    </>
  );
}
```

- [ ] **Step 8: 스타일과 앱**

`src/index.css` 끝에 더하고, 기존 `.hud-error`의 `top: 66%`를 `top: 69%`로 바꾼다:

```css
.hud-objective { position: absolute; left: 16px; top: 44px; max-width: 60%; font-size: 14px; color: #f0d9a8; pointer-events: none; }
.hud-revealed { position: absolute; right: 16px; top: 40px; color: #ff6b5a; font-weight: 600; pointer-events: none; }
.hud-vote { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); color: #ffb35a; pointer-events: none; }
.hud-vote.dim { color: #9a8f84; }
.hud-banner { position: absolute; left: 50%; top: 26%; transform: translateX(-50%); padding: 6px 14px; background: rgba(10, 8, 8, 0.7); font-weight: 600; pointer-events: none; text-align: center; }
.hud-banner.guilty { color: #ff6b5a; }
.hud-banner.innocent { color: #8fd3ff; }
.hud-bound { position: absolute; left: 50%; top: 54%; transform: translateX(-50%); color: #ffb35a; font-weight: 600; pointer-events: none; }
.hud-prompt.low { top: 64%; }
```

`src/App.tsx`: import의 `LEVEL_1`을 `RUINS`로, `const layout = parseLevel(LEVEL_1, TILE_SIZE);`를 `const layout = parseLevel(RUINS, TILE_SIZE);`로 바꾼다.

- [ ] **Step 9: 확인과 커밋**

Run: `npm run typecheck && npm test && npm run build`
Expected: 타입 에러 없음, 전부 PASS, 빌드 성공.

```bash
git add src
git commit -m "feat: draw gates, shards, devices, altar, plates and the boss; objective, vote and bound HUD"
git push origin master
```

---

### Task 9: 브라우저 확인, 문서, 푸시

**Files:**
- Modify: `README.md`
- Modify: 이 계획 문서(실행 중 바뀐 코드 반영)

- [ ] **Step 1: 연습 모드로 흐름 확인**

`preview_start {name: "traitor-hunt-dev"}`, "연습 (봇 3명)" 클릭. 각 단계 뒤 `read_console_messages {onlyErrors: true}`가 비어 있어야 한다. `g = window.__game`.

1. `g.hud().objective.stage === "shards"`, 스크린샷(시작 구역, 발판 4개와 이름표, 룬 조각 빛).
2. 조각·문: `g.setPose({x:38,z:6,yaw:0})` → 0.4초 → `await g.interact()` → `null`; `(6,30)`도 같게; `g.setPose({x:39.2,z:18,yaw:-Math.PI/2})` → `await g.interact()` → `null`. `g.state().match.objectives.gates`에 1. 스크린샷(문 1이 사라짐). (봇이 먼저 주웠으면 `nothing_here`도 허용)
3. 장치: `await g.setStage("devices")`, 장치 두 곳에서 빠르게 `interact` → 문 2 열림.
4. 봉인: `await g.setStage("seal")`, `g.setPose({x:82,z:34,yaw:0})` → `interact` → 물결 좀비 3마리, 스크린샷(제단 고리). 10초 뒤 `g.hud().objective.sealMs > 0`.
5. 보스: `await g.setStage("boss")`, `g.setPose({x:54,z:44,yaw:0,pitch:0.1})` → 스크린샷(큰 붉은 좀비). 좀비가 다가와 칠 때 공격 동작이 나오는지 스크린샷으로 확인.
6. 투표: 새 연습 판에서 배신자를 `g.state().match` 로는 알 수 없으니, 봇 하나의 발판(`g.layout().plates[i]`)에 서서 5초 이상 기다린다. 봇이 1.5초 뒤 따라와 서고 5초 뒤 결과 배너가 뜬다(`g.hud().lastVote`). 무고하면 그 봇에 묶임 고리, `g.hud().plateLockedMs`가 채워진다. 스크린샷.
7. 탈출: `await g.setStage("exit")`, `g.setPose({x:54,z:46,yaw:0})` → `await g.escape()` → `null`.
8. `g.stats().calls`가 600 미만.

- [ ] **Step 2: 문서**

README "현재 상태"에 더한다:

```markdown
Plan 4 완료: 한 판 20분 협동 모험(룬 조각 → 장치 → 봉인 해제와 몬스터 물결 → 보스 → 탈출), 발판에 모여 배신자를 지목하는 "몸으로 투표", 사람처럼 움직이는 연습 봇.
조작: WASD 이동, 클릭 사격, E 상호작용, F 탈출, 배신자는 Q 빙의 · R 해제.
```

실행 중 계획과 달라진 코드가 있으면 이 문서의 해당 코드 블록도 같게 고친다.

- [ ] **Step 3: 커밋·푸시**

```bash
git add README.md docs/superpowers/plans/2026-09-17-traitor-hunt-p4-coop-objectives.md
git commit -m "docs: plan 4 status"
git push origin master
```

---

## 완료 기준 (Plan 4)

- `npm run typecheck`, `npm test`, `npm run build`, `npm run server:test`, `npm run server:typecheck` 모두 통과.
- 봇만으로 한 판을 돌리면 봉인 단계 이상까지 간다.
- 브라우저 연습 모드에서 다섯 단계, 발판 투표, 묶임·공개 표시, 몬스터 공격 동작을 확인했다.
