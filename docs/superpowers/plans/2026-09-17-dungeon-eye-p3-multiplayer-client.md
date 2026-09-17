# Dungeon Eye — Plan 3: Multiplayer Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Work directly on `master` (solo project — no feature branches).

**Goal:** 브라우저 화면을 Plan 2 서버에 연결해 4인 한 판을 실제로 플레이할 수 있게 한다. Verse8 실서버가 없어도 되도록, 같은 서버 코드를 브라우저 안에서 돌리는 **연습 모드(나 + 봇 3명)**를 함께 만든다. 배신자는 몬스터 시점으로 들어가 조종·공격할 수 있고, 모험가는 다른 플레이어·몬스터를 보고 쏘고 탈출할 수 있다.

**Architecture:**
- `server/src/server.ts`를 그대로 브라우저·테스트에서 돌리는 `LocalWorld`(Verse8 전역 `$global`·`$room`·`$sender`·`$lock`의 메모리 구현)를 만든다.
- 화면은 `MatchTransport` 인터페이스로만 서버와 이야기한다. 구현은 `LocalTransport`(연습 모드)와 `Verse8Transport`(실서버, `@agent8/gameserver`) 두 가지다.
- `MatchClient`가 방 상태·사용자 위치·메시지를 모아 화면용 상태를 만들고, 행동 호출을 감싼다.
- 몬스터 AI는 순수 함수(`stepMonsterAi`)로 두고, 방의 호스트(첫 번째 활동 플레이어) 클라이언트가 `HostDirector`로 돌린다. 봇(`BotBrain`)도 같은 `MatchClient`를 쓴다.
- 3D 화면(`MatchView`)은 `MatchClient` 상태를 그리고 입력을 행동 호출로 바꾼다. React는 타이틀·대기·HUD·결과만 맡는다.

**Tech Stack:** TypeScript, React 18, three 0.185, vitest 3 (fake timers), `@agent8/gameserver` 1.10.2.

## 로드맵 (2026-09-17 갱신)

사용자 결정: 한 판을 **15~20분**의 협동 모험으로 늘린다. 판 안에 **단계형 구역 돌파 + 열쇠·장치 찾기 + 몬스터 물결·보스**를 넣고, 화면 연결을 먼저 끝낸 뒤 직접 해보며 설계한다.

| 계획 | 내용 |
|---|---|
| Plan 1·2 (완료) | 싱글 FPS 기반, 서버 매치 규칙·판 기록 |
| **Plan 3 (이 문서)** | 멀티플레이 화면 연결, 연습 모드(봇), 빙의 조작 |
| Plan 4 | 판 안 협동 목표: 구역·열쇠/장치·몬스터 물결·보스, 큰 던전, 판 길이 15~20분 (설계부터) |
| Plan 5 | 계정 레벨·해금 + 미션·업적 |
| Plan 6 | 랭킹·시즌 |
| Plan 7 | 1인칭 손·효과음·연출 다듬기, 모바일 조작, 성능·부하 점검, Verse8 배포 |

이 계획의 8분 제한시간(`MATCH_DURATION_MS`)은 Plan 4에서 바뀐다. 화면은 이 값을 직접 쓰지 않고 서버가 준 `endsAt`만 쓴다.

## 이번 계획에서 하지 않는 것

- 판 안 협동 목표 (Plan 4)
- 1인칭 손 모델, 효과음 다듬기(비명은 간단한 합성음만), 모바일 조작·배포·부하 측정 (Plan 7)
- 레벨·미션·랭킹 (Plan 5·6)
- Verse8 실서버 연결 **검증**은 사용자가 Verse8 프로젝트를 만든 뒤 작업 9에서 한다(코드는 이 계획에서 완성).

## Global Constraints

- `master`에서 바로 작업·커밋한다.
- 규칙 모듈(`src/game/rules/`, `src/game/match/`)은 `three`/`react`/DOM/Verse8 전역을 참조하지 않는다.
- `src/net/`은 `three`/`react`를 참조하지 않는다(테스트는 node 환경).
- 방 상태의 `yaw`는 카메라 규칙(앞 = `(-sin yaw, -cos yaw)`)이다. 모델은 +z를 앞으로 만들어져 있으므로 그릴 때 `rotation.y = yaw + Math.PI`.
- 서버 함수 이름·메시지 이름은 Plan 2 그대로: `getServerVersion`, `findMatch`, `leaveMatch`, `getMatchState`, `syncMatch`, `devAdvanceClock`, `reportPose`, `reportMonsters`, `possess`, `release`, `fireAtMonster`, `fireAtPlayer`, `attackWithMonster`, `escape` / 메시지 `private`, `pain`, `possession`, `ended`.
- 호출 빈도: 위치 보고 100ms, 몬스터 보고 150ms (throttle, 응답 없음), `syncMatch` 1초마다(응답 없음).
- 연습 모드 계정 이름은 `test-`로 시작한다(디버그용 시계 당기기가 허용됨).
- 기존 테스트(vitest 96, 서버 20)는 계속 통과해야 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
src/game/rules/
  movement.ts            (수정) stepPlayer 속도 인자
  levelLayout.ts         (수정) spawnPoint(layout, index)
  pathfinding.ts         칸 단위 길찾기(BFS)
src/game/match/
  monsterAi.ts           몬스터 추적·공격 결정(순수)
src/net/
  local/agent8-globals.d.ts   Verse8 서버 전역의 느슨한 타입 (앱·테스트에서 server/src를 컴파일하기 위해)
  local/localWorld.ts    서버 코드를 메모리에서 돌리는 가짜 Verse8
  throttle.ts            호출 간격 제한
  transport.ts           MatchTransport 인터페이스
  localTransport.ts      연습 모드 연결
  verse8Transport.ts     Verse8 실서버 연결
  matchClient.ts         화면용 매치 상태 + 행동 호출
  hostDirector.ts        호스트가 몬스터 AI를 돌리고 보고
  practice.ts            연습 모드 세션(나 + 봇 3)
src/game/bots/
  botBrain.ts            봇 행동(모험가: 몬스터 쏘며 탈출, 배신자: 몬스터 찾아 빙의·공격)
src/game/render/
  skinned.ts             스킨 모델 키 재기 (ZombieActor에서 분리)
  MonsterActor.ts        (ZombieActor.ts 대체) 상태를 따라 움직이는 몬스터
  RemotePlayerActor.ts   다른 플레이어
  FpsInput.ts            (수정) 한 번 눌림 키
  MatchView.ts           (GameView.ts 대체) 매치 화면
  scream.ts              비명 합성음
src/ui/
  TitleScreen.tsx, MatchScreen.tsx, Hud.tsx
src/App.tsx, src/main.tsx, src/index.css   (수정)
tests/rules/pathfinding.test.ts, tests/movement.test.ts(수정), tests/levelLayout.test.ts(수정)
tests/match/monsterAi.test.ts
tests/net/localWorld.test.ts, tests/net/transport.test.ts, tests/net/matchClient.test.ts
tests/bots/botMatch.test.ts
tsconfig.node.json     (수정) agent8-globals.d.ts 포함
```

삭제: `src/game/render/GameView.ts`, `src/game/render/ZombieActor.ts`

---

### Task 1: 이동 속도 인자, 시작 위치, 길찾기

**Files:**
- Modify: `src/game/rules/movement.ts`, `tests/movement.test.ts`
- Modify: `src/game/rules/levelLayout.ts`, `tests/levelLayout.test.ts`
- Create: `src/game/rules/pathfinding.ts`
- Test: `tests/rules/pathfinding.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // movement.ts
  export function stepPlayer(pose: PlayerPose, input: MoveInput, dt: number, isSolid: SolidTest, speed?: number): PlayerPose  // speed 기본값 WALK_SPEED
  // levelLayout.ts
  export function spawnPoint(layout: LevelLayout, index: number): Point2   // 시작 칸 안에서 사람마다 다른 자리 (4개, 순환)
  // pathfinding.ts
  export interface Cell { col: number; row: number }
  export function cellOf(layout: LevelLayout, p: Point2): Cell
  export function cellCenter(layout: LevelLayout, cell: Cell): Point2
  export function findPath(layout: LevelLayout, from: Point2, to: Point2): Point2[] | null
  ```
  `findPath`는 시작 칸 다음 칸부터 목표 칸까지의 칸 중심 목록을 돌려주되, 마지막 점은 `to` 그대로다. 같은 칸이면 `[to]`, 갈 수 없으면 `null`.

- [ ] **Step 1: 실패하는 테스트**

`tests/movement.test.ts`의 `describe("stepPlayer", ...)` 안 끝에 추가:
```ts
  it("moves at a custom speed when one is given", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 0 }, 0.1, open, 2);
    expect(10 - next.z).toBeCloseTo(0.2);
  });
```

`tests/levelLayout.test.ts`: 첫 import 줄을 교체
```ts
import { LEVEL_1, parseLevel, solidAt, spawnPoint } from "../src/game/rules/levelLayout";
```
`describe("LEVEL_1", ...)` 안 끝에 추가:
```ts
  it("gives each player a different open spot in the spawn cell", () => {
    const level = parseLevel(LEVEL_1, 4);
    const spots = [0, 1, 2, 3].map((i) => spawnPoint(level, i));
    expect(new Set(spots.map((s) => `${s.x},${s.z}`)).size).toBe(4);
    for (const s of spots) {
      expect(Math.floor(s.x / 4)).toBe(1);
      expect(Math.floor(s.z / 4)).toBe(1);
    }
    expect(spawnPoint(level, 4)).toEqual(spots[0]);
  });
```

`tests/rules/pathfinding.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { LEVEL_1, parseLevel, solidAt } from "../../src/game/rules/levelLayout";
import { cellCenter, cellOf, findPath } from "../../src/game/rules/pathfinding";

const level = parseLevel(LEVEL_1, 4);

describe("findPath", () => {
  it("walks from the spawn to the exit through open cells, one cell at a time", () => {
    const path = findPath(level, level.playerSpawn, level.exits[0]);
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual(level.exits[0]);
    let prev = cellOf(level, level.playerSpawn);
    for (const p of path!) {
      const cell = cellOf(level, p);
      expect(Math.abs(cell.col - prev.col) + Math.abs(cell.row - prev.row)).toBe(1);
      expect(solidAt(level, p.x, p.z)).toBe(false);
      prev = cell;
    }
  });

  it("returns just the target inside the same cell", () => {
    expect(findPath(level, { x: 5, z: 5 }, { x: 7, z: 6 })).toEqual([{ x: 7, z: 6 }]);
  });

  it("returns null for a target inside a wall", () => {
    expect(findPath(level, level.playerSpawn, { x: 1, z: 1 })).toBeNull();
  });

  it("returns null when the target is walled off", () => {
    const boxed = parseLevel(["#####", "#P#.#", "#####"], 4);
    expect(findPath(boxed, boxed.playerSpawn, { x: 14, z: 6 })).toBeNull();
  });

  it("finds cell centers", () => {
    expect(cellCenter(level, { col: 2, row: 3 })).toEqual({ x: 10, z: 14 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/movement.test.ts tests/levelLayout.test.ts tests/rules/pathfinding.test.ts`
Expected: FAIL — 속도 테스트가 0.4를 받음, `spawnPoint is not a function`, `Cannot find module .../pathfinding`.

- [ ] **Step 3: 구현**

`src/game/rules/movement.ts` — `stepPlayer` 시그니처와 속도 계산 줄 교체:
```ts
export function stepPlayer(
  pose: PlayerPose, input: MoveInput, dt: number, isSolid: SolidTest, speed: number = WALK_SPEED,
): PlayerPose {
```
```ts
  const scale = (speed * step * Math.min(1, len)) / len;
```

`src/game/rules/levelLayout.ts` 끝에 추가:
```ts
const SPAWN_OFFSETS: Point2[] = [
  { x: -0.8, z: -0.8 },
  { x: 0.8, z: -0.8 },
  { x: -0.8, z: 0.8 },
  { x: 0.8, z: 0.8 },
];

export function spawnPoint(layout: LevelLayout, index: number): Point2 {
  const n = SPAWN_OFFSETS.length;
  const offset = SPAWN_OFFSETS[((index % n) + n) % n];
  return { x: layout.playerSpawn.x + offset.x, z: layout.playerSpawn.z + offset.z };
}
```

`src/game/rules/pathfinding.ts`:
```ts
import { solidAt, type LevelLayout, type Point2 } from "./levelLayout";

export interface Cell { col: number; row: number }

export function cellOf(layout: LevelLayout, p: Point2): Cell {
  return { col: Math.floor(p.x / layout.tileSize), row: Math.floor(p.z / layout.tileSize) };
}

export function cellCenter(layout: LevelLayout, cell: Cell): Point2 {
  return { x: (cell.col + 0.5) * layout.tileSize, z: (cell.row + 0.5) * layout.tileSize };
}

const STEPS: Cell[] = [{ col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 }];

export function findPath(layout: LevelLayout, from: Point2, to: Point2): Point2[] | null {
  const start = cellOf(layout, from);
  const goal = cellOf(layout, to);
  const walkable = (c: Cell) => {
    const p = cellCenter(layout, c);
    return !solidAt(layout, p.x, p.z);
  };
  if (!walkable(start) || !walkable(goal)) return null;

  const key = (c: Cell) => `${c.col},${c.row}`;
  const previous = new Map<string, Cell | null>([[key(start), null]]);
  const queue: Cell[] = [start];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (cell.col === goal.col && cell.row === goal.row) break;
    for (const s of STEPS) {
      const next = { col: cell.col + s.col, row: cell.row + s.row };
      if (previous.has(key(next)) || !walkable(next)) continue;
      previous.set(key(next), cell);
      queue.push(next);
    }
  }
  if (!previous.has(key(goal))) return null;

  const cells: Cell[] = [];
  for (let c: Cell | null = goal; c && key(c) !== key(start); c = previous.get(key(c)) ?? null) cells.unshift(c);
  const points = cells.map((c) => cellCenter(layout, c));
  if (points.length === 0) return [{ x: to.x, z: to.z }];
  points[points.length - 1] = { x: to.x, z: to.z };
  return points;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: 전체 PASS (96 + 7 = 103 tests), 타입 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/game/rules tests/movement.test.ts tests/levelLayout.test.ts tests/rules/pathfinding.test.ts
git commit -m "feat: movement speed option, spawn spots and grid pathfinding"
```

---

### Task 2: 몬스터 AI (순수)

**Files:**
- Create: `src/game/match/monsterAi.ts`
- Test: `tests/match/monsterAi.test.ts`

**Interfaces:**
- Consumes: `stepPlayer` (Task 1), `isActive`, `distance`, `MonsterPoseUpdate` (Plan 2)
- Produces:
  ```ts
  export const ZOMBIE_SPEED = 1.8;          // m/s
  export const ZOMBIE_AGGRO_RANGE = 14;     // m
  export interface MonsterOrder { monsterId: string; target: string }
  export interface AiStep { updates: MonsterPoseUpdate[]; attacks: MonsterOrder[] }
  export function stepMonsterAi(
    match: PublicMatch, poses: Poses, isSolid: SolidTest, dt: number, now: number, skip: (monsterId: string) => boolean,
  ): AiStep
  ```
- 규칙: 살아 있고, 빙의되지 않았고, 기절하지 않았고, `skip`이 거짓인 몬스터만 움직인다. 14m 안의 가장 가까운 활동 플레이어를 쫓는다. 공격 사거리의 80%보다 멀면 `stepPlayer`로 걷고(벽 충돌 포함), 가까우면 멈춰서 공격 대기가 끝났을 때 공격 주문을 낸다. `yaw`는 카메라 규칙.

- [ ] **Step 1: 실패하는 테스트** — `tests/match/monsterAi.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { ZOMBIE_AGGRO_RANGE, ZOMBIE_SPEED, stepMonsterAi } from "../../src/game/match/monsterAi";
import type { Pose, Poses } from "../../src/game/match/types";
import { PLAYER_RADIUS } from "../../src/game/rules/movement";

const open = () => false;
const at = (x: number, z: number): Pose => ({ x, z, yaw: 0 });
const never = () => false;

function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 10, z: 10 }]);
  return match;
}

describe("stepMonsterAi", () => {
  it("walks toward the nearest active player in range", () => {
    const match = playing();
    const poses: Poses = { a: at(10, 20), b: at(10, 14), c: null, d: at(40, 40) };
    const step = stepMonsterAi(match, poses, open, 0.1, 0, never);
    expect(step.attacks).toEqual([]);
    expect(step.updates).toHaveLength(1);
    const u = step.updates[0];
    expect(u.id).toBe("zombie-0");
    expect(u.x).toBeCloseTo(10);
    expect(u.z).toBeCloseTo(10 + ZOMBIE_SPEED * 0.1);
    // Camera convention: forward (-sin yaw, -cos yaw) = (0, +1) means yaw = ±π.
    expect(Math.abs(u.yaw)).toBeCloseTo(Math.PI);
  });

  it("ignores players out of range, dead or escaped", () => {
    const match = playing();
    match.dead.push("a");
    match.escaped.push("c");
    const poses: Poses = { a: at(10, 11), b: at(10, 10 + ZOMBIE_AGGRO_RANGE + 1), c: at(11, 10), d: null };
    expect(stepMonsterAi(match, poses, open, 0.1, 0, never)).toEqual({ updates: [], attacks: [] });
  });

  it("stops and attacks when close, once the attack timer allows it", () => {
    const match = playing();
    const poses: Poses = { b: at(10, 11) };
    const step = stepMonsterAi(match, poses, open, 0.1, 0, never);
    expect(step.updates[0]).toMatchObject({ id: "zombie-0", x: 10, z: 10 });
    expect(step.attacks).toEqual([{ monsterId: "zombie-0", target: "b" }]);

    match.monsters["zombie-0"].attackReadyAt = 500;
    expect(stepMonsterAi(match, poses, open, 0.1, 0, never).attacks).toEqual([]);
    expect(stepMonsterAi(match, poses, open, 0.1, 500, never).attacks).toHaveLength(1);
  });

  it("does nothing while stunned", () => {
    const match = playing();
    match.monsters["zombie-0"].stunnedUntil = 500;
    expect(stepMonsterAi(match, { b: at(10, 11) }, open, 0.1, 0, never)).toEqual({ updates: [], attacks: [] });
  });

  it("leaves possessed, dead and skipped monsters alone", () => {
    const poses: Poses = { b: at(10, 12) };
    const possessed = playing();
    possessed.monsters["zombie-0"].possessed = true;
    expect(stepMonsterAi(possessed, poses, open, 0.1, 0, never).updates).toEqual([]);
    const dead = playing();
    dead.monsters["zombie-0"].alive = false;
    expect(stepMonsterAi(dead, poses, open, 0.1, 0, never).updates).toEqual([]);
    const skipped = playing();
    expect(stepMonsterAi(skipped, poses, open, 0.1, 0, (id) => id === "zombie-0").updates).toEqual([]);
  });

  it("walks up to a wall but not into it", () => {
    const match = playing();
    const wallAhead = (_x: number, z: number) => z > 10.5;
    const step = stepMonsterAi(match, { b: at(10, 14) }, wallAhead, 0.1, 0, never);
    expect(step.updates[0].z).toBeGreaterThan(10);
    expect(step.updates[0].z + PLAYER_RADIUS).toBeLessThanOrEqual(10.5);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/match/monsterAi.test.ts`
Expected: FAIL — `Cannot find module '../../src/game/match/monsterAi'`

- [ ] **Step 3: 구현** — `src/game/match/monsterAi.ts`

```ts
import { stepPlayer, type SolidTest } from "../rules/movement";
import { ZOMBIE_ATTACK_RANGE } from "./constants";
import type { MonsterPoseUpdate } from "./damage";
import { isActive } from "./lifecycle";
import type { Poses, PublicMatch } from "./types";
import { distance } from "./view";

export const ZOMBIE_SPEED = 1.8;
export const ZOMBIE_AGGRO_RANGE = 14;
const STOP_DISTANCE = ZOMBIE_ATTACK_RANGE * 0.8;

export interface MonsterOrder { monsterId: string; target: string }
export interface AiStep { updates: MonsterPoseUpdate[]; attacks: MonsterOrder[] }

export function stepMonsterAi(
  match: PublicMatch, poses: Poses, isSolid: SolidTest, dt: number, now: number, skip: (monsterId: string) => boolean,
): AiStep {
  const updates: MonsterPoseUpdate[] = [];
  const attacks: MonsterOrder[] = [];
  for (const [id, monster] of Object.entries(match.monsters)) {
    if (!monster.alive || monster.possessed || now < monster.stunnedUntil || skip(id)) continue;

    let target: { account: string; x: number; z: number; d: number } | null = null;
    for (const account of match.players) {
      const pose = poses[account];
      if (!pose || !isActive(match, account)) continue;
      const d = distance(pose, monster);
      if (d <= ZOMBIE_AGGRO_RANGE && (!target || d < target.d)) target = { account, x: pose.x, z: pose.z, d };
    }
    if (!target) continue;

    const yaw = Math.atan2(-(target.x - monster.x), -(target.z - monster.z));
    if (target.d > STOP_DISTANCE) {
      const moved = stepPlayer({ x: monster.x, z: monster.z, yaw }, { forward: 1, strafe: 0 }, dt, isSolid, ZOMBIE_SPEED);
      updates.push({ id, x: moved.x, z: moved.z, yaw });
    } else {
      updates.push({ id, x: monster.x, z: monster.z, yaw });
      if (now >= monster.attackReadyAt) attacks.push({ monsterId: id, target: target.account });
    }
  }
  return { updates, attacks };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: 전체 PASS (103 + 6 = 109 tests), 타입 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/game/match/monsterAi.ts tests/match/monsterAi.test.ts
git commit -m "feat: monster chase and attack decisions"
```

---

### Task 3: 브라우저 안에서 서버 돌리기 (LocalWorld)

`server/src/server.ts`는 Verse8 전역(`$global`, `$room`, `$sender`, `$lock`)만 쓴다. 이 전역을 메모리로 흉내 내면 같은 서버 코드를 연습 모드와 vitest에서 돌릴 수 있다. 호출은 한 번에 하나씩(직렬) 처리하고 — 전역은 프로세스 전체에 하나뿐이므로 **모든 LocalWorld가 대기열 하나를 함께 쓴다** — 호출하는 동안에만 전역을 그 호출자의 것으로 바꿔 끼운다. 실서버처럼 주고받는 값은 JSON 복사한다.

동작 규칙(Plan 2에서 확인한 Verse8 동작과 맞춤):
- `getRoomState(id)`는 `{ roomId, $users, ...state }`. 없는 방은 `{ roomId, $users: [] }`.
- `getAllRoomStates()`는 **사람이 있는 방만** 돌려준다.
- 한 계정은 한 방에만 있다(`joinRoom`하면 이전 방에서 빠짐).
- 없는 컬렉션 항목을 읽거나 고치면 예외.
- `$room` 메시지는 보낸 사람의 방으로 간다. 이벤트 순서: 호출이 끝나면 바뀐 방 상태 → 바뀐 사용자 상태 → 메시지.

**Files:**
- Create: `src/net/local/agent8-globals.d.ts`
- Create: `src/net/local/localWorld.ts`
- Modify: `tsconfig.node.json`
- Test: `tests/net/localWorld.test.ts`

**Interfaces:**
- Consumes: `server/src/server.ts`의 `Server` (Plan 2)
- Produces:
  ```ts
  export type Json = Record<string, any>;
  export type WorldEvent =
    | { kind: "roomState"; roomId: string; state: Json }
    | { kind: "roomUsers"; roomId: string; users: Json[] }      // [{ account, ...userState }]
    | { kind: "message"; roomId: string; to: string | null; type: string; message: unknown };  // to null = 방 전체
  export class LocalWorld {
    constructor(server: object);
    call(account: string, roomId: string | null, name: string, args?: unknown[]): Promise<unknown>;
    tick(roomId: string): Promise<void>;          // $roomTick 대신
    tickAll(): Promise<void>;                     // 사람이 있는 모든 방
    idle(): Promise<void>;                        // 대기 중인 호출이 모두 끝날 때까지
    subscribe(listener: (event: WorldEvent) => void): () => void;
    roomState(roomId: string): Json;
  }
  ```

- [ ] **Step 1: 전역 타입** — `src/net/local/agent8-globals.d.ts`

```ts
// Loose types for the Verse8 server globals, so server/src compiles inside the app and tests
// (LocalWorld installs real implementations at call time). The server project uses the
// official @agent8/gameserver-node types instead.
declare const $global: any;
declare const $room: any;
declare const $sender: { account: string; roomId?: string };
declare function $lock<T>(lockKey: string, fn: () => T | Promise<T>): Promise<T>;
```

`tsconfig.node.json`의 `include`를 교체:
```json
  "include": ["vite.config.ts", "vitest.config.ts", "tests", "src/net/local/agent8-globals.d.ts"]
```

- [ ] **Step 2: 실패하는 테스트** — `tests/net/localWorld.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { Server } from "../../server/src/server";
import { LocalWorld, type WorldEvent } from "../../src/net/local/localWorld";

const PLAYERS = ["test-a", "test-b", "test-c", "test-d"];

async function fill(world: LocalWorld): Promise<string> {
  let roomId = "";
  for (const p of PLAYERS) roomId = ((await world.call(p, null, "findMatch")) as { roomId: string }).roomId;
  return roomId;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("LocalWorld", () => {
  it("runs the real server: four players start one match with one traitor", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    const roles: string[] = [];
    for (const p of PLAYERS) {
      const snap = (await world.call(p, roomId, "getMatchState")) as { match: { phase: string }; you: { role: string } };
      expect(snap.match.phase).toBe("playing");
      roles.push(snap.you.role);
    }
    expect(roles.filter((r) => r === "traitor")).toHaveLength(1);
    expect(world.roomState(roomId).$users).toEqual(PLAYERS);
  });

  it("emits the changed room state before the messages", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    await world.call(PLAYERS[0], roomId, "reportPose", [{ x: 6, z: 6, yaw: 0 }]);
    await world.call(PLAYERS[1], roomId, "reportPose", [{ x: 6, z: 9, yaw: 0 }]);
    const events: WorldEvent[] = [];
    world.subscribe((e) => events.push(e));
    await world.call(PLAYERS[0], roomId, "fireAtPlayer", [PLAYERS[1]]);
    expect(events.map((e) => e.kind)).toEqual(["roomState", "message"]);
    const message = events[1] as Extract<WorldEvent, { kind: "message" }>;
    expect(message).toMatchObject({ roomId, to: PLAYERS[1], type: "private" });
    expect((message.message as { hp: number }).hp).toBe(66);
  });

  it("reports user states as account plus state", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    const events: WorldEvent[] = [];
    world.subscribe((e) => events.push(e));
    await world.call(PLAYERS[2], roomId, "reportPose", [{ x: 1, z: 2, yaw: 3 }]);
    const users = events.find((e) => e.kind === "roomUsers") as Extract<WorldEvent, { kind: "roomUsers" }>;
    const mine = users.users.find((u) => u.account === PLAYERS[2])!;
    expect([mine.pose.x, mine.pose.z, mine.pose.yaw]).toEqual([1, 2, 3]);
  });

  it("passes rule errors through and refuses unknown or hook functions", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    expect(await codeOf(world.call(PLAYERS[0], roomId, "escape"))).toContain("not_at_exit");
    expect(await codeOf(world.call(PLAYERS[0], roomId, "nope"))).toContain("unknown server function");
    expect(await codeOf(world.call(PLAYERS[0], roomId, "$roomTick", [0, roomId]))).toContain("unknown server function");
  });

  it("serializes overlapping calls and restores the globals afterwards", async () => {
    const world = new LocalWorld(new Server());
    const results = await Promise.all(PLAYERS.map((p) => world.call(p, null, "findMatch")));
    const ids = new Set(results.map((r) => (r as { roomId: string }).roomId));
    expect(ids.size).toBe(1);
    expect((globalThis as Record<string, unknown>).$global).toBeUndefined();
    expect((globalThis as Record<string, unknown>).$sender).toBeUndefined();
  });

  it("keeps two worlds apart even when their calls overlap", async () => {
    const first = new LocalWorld(new Server());
    const second = new LocalWorld(new Server());
    const calls: Promise<unknown>[] = [];
    for (const p of PLAYERS) {
      calls.push(first.call(p, null, "findMatch"));
      calls.push(second.call(`${p}-2`, null, "findMatch"));
    }
    const ids = (await Promise.all(calls)).map((r) => (r as { roomId: string }).roomId);
    const firstRoom = first.roomState(ids[0]);
    const secondRoom = second.roomState(ids[1]);
    expect(firstRoom.match.players).toEqual(PLAYERS);
    expect(secondRoom.match.players).toEqual(PLAYERS.map((p) => `${p}-2`));
  });

  it("copies values so callers cannot change stored state", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    const snap = (await world.call(PLAYERS[0], roomId, "getMatchState")) as { match: { players: string[] } };
    snap.match.players.push("intruder");
    expect(world.roomState(roomId).match.players).toEqual(PLAYERS);
  });

  it("ticks rooms like $roomTick, ending a match whose time is up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    await world.tickAll();
    expect(world.roomState(roomId).match.phase).toBe("playing");
    vi.setSystemTime(1_000_000 + 9 * 60_000);
    await world.tickAll();
    expect(world.roomState(roomId).match.phase).toBe("ended");
  });

  it("drops a player from the room list when they leave", async () => {
    const world = new LocalWorld(new Server());
    const first = (await world.call("test-x", null, "findMatch")) as { roomId: string };
    await world.call("test-x", first.roomId, "leaveMatch");
    expect(world.roomState(first.roomId).$users).toEqual([]);
    const again = (await world.call("test-y", null, "findMatch")) as { roomId: string };
    expect(again.roomId === first.roomId).toBe(false);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/net/localWorld.test.ts`
Expected: FAIL — `Cannot find module '../../src/net/local/localWorld'`

- [ ] **Step 4: 구현** — `src/net/local/localWorld.ts`

```ts
export type Json = Record<string, any>;

export type WorldEvent =
  | { kind: "roomState"; roomId: string; state: Json }
  | { kind: "roomUsers"; roomId: string; users: Json[] }
  | { kind: "message"; roomId: string; to: string | null; type: string; message: unknown };

interface RoomRecord {
  state: Json;
  users: Map<string, Json>;
  members: string[];
}

type AnyFunction = (...args: unknown[]) => unknown;

function copy<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

const GLOBAL_NAMES = ["$global", "$room", "$sender", "$lock"] as const;

// The Verse8 globals are process-wide, so every world must take turns, not just calls within one world.
let sharedQueue: Promise<unknown> = Promise.resolve();

export class LocalWorld {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly userStates = new Map<string, Json>();
  private readonly collections = new Map<string, Map<string, Json>>();
  private readonly listeners = new Set<(event: WorldEvent) => void>();
  private readonly dirtyRooms = new Set<string>();
  private readonly dirtyUsers = new Set<string>();
  private pendingMessages: WorldEvent[] = [];
  private seq = 0;

  constructor(private readonly server: object) {}

  subscribe(listener: (event: WorldEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  call(account: string, roomId: string | null, name: string, args: unknown[] = []): Promise<unknown> {
    return this.enqueue(async () => {
      const fn = (this.server as Record<string, unknown>)[name];
      if (typeof fn !== "function" || name.startsWith("$") || name === "constructor") {
        throw new Error(`unknown server function: ${name}`);
      }
      const result = await this.withContext(account, roomId, () => (fn as AnyFunction).apply(this.server, copy(args)));
      return copy(result);
    });
  }

  tick(roomId: string): Promise<void> {
    return this.enqueue(async () => {
      const hook = (this.server as Record<string, unknown>).$roomTick;
      if (typeof hook === "function") await this.withContext("", null, () => (hook as AnyFunction).call(this.server, 0, roomId));
    }) as Promise<void>;
  }

  async tickAll(): Promise<void> {
    for (const [roomId, room] of this.rooms) if (room.members.length > 0) await this.tick(roomId);
  }

  async idle(): Promise<void> {
    let seen: Promise<unknown> | null = null;
    while (seen !== sharedQueue) {
      seen = sharedQueue;
      await seen;
    }
  }

  roomState(roomId: string): Json {
    const room = this.rooms.get(roomId);
    return copy({ roomId, $users: room ? [...room.members] : [], ...(room?.state ?? {}) });
  }

  private enqueue(work: () => Promise<unknown>): Promise<unknown> {
    const result = sharedQueue.then(work, work);
    sharedQueue = result.catch(() => undefined);
    return result;
  }

  private async withContext<T>(account: string, roomId: string | null, fn: () => T | Promise<T>): Promise<T> {
    const scope = globalThis as Record<string, unknown>;
    const saved = GLOBAL_NAMES.map((name) => scope[name]);
    const sender = { account, roomId: roomId ?? undefined };
    scope.$sender = sender;
    scope.$global = this.globalApi(account);
    scope.$room = this.roomApi(() => sender.roomId);
    scope.$lock = async (_key: string, work: () => unknown) => work();
    try {
      return await fn();
    } finally {
      GLOBAL_NAMES.forEach((name, i) => {
        if (saved[i] === undefined) delete scope[name];
        else scope[name] = saved[i];
      });
      this.flush();
    }
  }

  private room(roomId: string): RoomRecord {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { state: {}, users: new Map(), members: [] };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  private collection(id: string): Map<string, Json> {
    let items = this.collections.get(id);
    if (!items) {
      items = new Map();
      this.collections.set(id, items);
    }
    return items;
  }

  private leaveAll(account: string): string | null {
    let left: string | null = null;
    for (const [roomId, room] of this.rooms) {
      if (!room.members.includes(account)) continue;
      room.members = room.members.filter((m) => m !== account);
      this.dirtyRooms.add(roomId);
      left = roomId;
    }
    return left;
  }

  private globalApi(account: string) {
    const merge = (target: Json, patch: Json) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete target[key];
        else target[key] = copy(value);
      }
    };
    return {
      getRoomState: async (roomId: string) => this.roomState(roomId),
      updateRoomState: async (roomId: string, patch: Json) => {
        const room = this.room(roomId);
        merge(room.state, patch);
        this.dirtyRooms.add(roomId);
        return copy(room.state);
      },
      getAllRoomStates: async () =>
        [...this.rooms.entries()].filter(([, r]) => r.members.length > 0).map(([id]) => this.roomState(id)),
      getRoomUserState: async (roomId: string, user: string) => copy(this.rooms.get(roomId)?.users.get(user) ?? {}),
      updateRoomUserState: async (roomId: string, user: string, patch: Json) => {
        const room = this.room(roomId);
        const state = room.users.get(user) ?? {};
        merge(state, patch);
        room.users.set(user, state);
        this.dirtyUsers.add(roomId);
        return copy(state);
      },
      joinRoom: async (roomId?: string) => {
        const id = roomId ?? `room-${++this.seq}`;
        this.leaveAll(account);
        this.room(id).members.push(account);
        this.dirtyRooms.add(id);
        return id;
      },
      leaveRoom: async () => this.leaveAll(account) ?? "",
      getUserState: async (user: string) => copy(this.userStates.get(user) ?? {}),
      updateUserState: async (user: string, patch: Json) => {
        const state = this.userStates.get(user) ?? {};
        merge(state, patch);
        this.userStates.set(user, state);
        return copy(state);
      },
      addCollectionItem: async (collectionId: string, item: Json) => {
        const stored = { ...copy(item), __id: `item-${++this.seq}` };
        this.collection(collectionId).set(stored.__id, stored);
        return copy(stored);
      },
      getCollectionItem: async (collectionId: string, itemId: string) => {
        const item = this.collections.get(collectionId)?.get(itemId);
        if (!item) throw new Error(`Item ${itemId} not found in collection ${collectionId}`);
        return copy(item);
      },
      updateCollectionItem: async (collectionId: string, item: Json) => {
        const stored = this.collections.get(collectionId)?.get(item.__id);
        if (!stored) throw new Error(`Item ${item.__id} not found in collection ${collectionId}`);
        merge(stored, item);
        return copy(stored);
      },
      getCollectionItems: async (collectionId: string) => [...this.collection(collectionId).values()].map(copy),
      countCollectionItems: async (collectionId: string) => this.collections.get(collectionId)?.size ?? 0,
      deleteCollection: async (collectionId: string) => {
        this.collections.delete(collectionId);
        return collectionId;
      },
    };
  }

  private roomApi(currentRoom: () => string | undefined) {
    const push = (to: string | null, type: string, message: unknown) => {
      const roomId = currentRoom();
      if (roomId) this.pendingMessages.push({ kind: "message", roomId, to, type, message: copy(message) });
    };
    return {
      broadcastToRoom: (type: string, message: unknown) => push(null, type, message),
      sendMessageToUser: (type: string, to: string, message: unknown) => push(to, type, message),
    };
  }

  private flush(): void {
    const events: WorldEvent[] = [];
    for (const roomId of this.dirtyRooms) events.push({ kind: "roomState", roomId, state: this.roomState(roomId) });
    for (const roomId of this.dirtyUsers) {
      const users = [...(this.rooms.get(roomId)?.users.entries() ?? [])].map(([account, state]) => ({ account, ...copy(state) }));
      events.push({ kind: "roomUsers", roomId, users });
    }
    events.push(...this.pendingMessages);
    this.dirtyRooms.clear();
    this.dirtyUsers.clear();
    this.pendingMessages = [];
    for (const event of events) for (const listener of this.listeners) listener(event);
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/net/localWorld.test.ts && npm test && npm run typecheck`
Expected: localWorld 9 PASS, 전체 118 PASS, 타입 에러 없음.

타입 에러가 `server/src/*.ts`에서 나면(예: `noUnusedLocals`), 그 파일을 고치지 말고 에러 내용을 보고한다 — 서버 파일은 Plan 2의 서버 테스트로 검증된 상태다.

- [ ] **Step 6: 커밋**

```bash
git add src/net/local tsconfig.node.json tests/net/localWorld.test.ts
git commit -m "feat: run the Verse8 server in memory for practice mode and tests"
```

---

### Task 4: 연결 계층 (MatchTransport, 연습용·Verse8용)

**Files:**
- Create: `src/net/throttle.ts`, `src/net/transport.ts`, `src/net/localTransport.ts`, `src/net/verse8Transport.ts`
- Test: `tests/net/transport.test.ts`

**Interfaces:**
- Consumes: `LocalWorld`, `WorldEvent` (Task 3), `GameServer` 타입 (`@agent8/gameserver`)
- Produces:
  ```ts
  // throttle.ts
  export class CallThrottle { allow(key: string, windowMs: number, now: number): boolean }   // 창 안의 두 번째 호출부터 false
  // transport.ts
  export interface CallOptions { needResponse?: boolean; throttle?: number; throttleKey?: string }
  export interface RoomUser { account: string; pose?: { x: number; z: number; yaw: number; at?: number } }
  export interface MatchTransport {
    readonly account: string;
    call<T = unknown>(name: string, args?: unknown[], options?: CallOptions): Promise<T>;
    subscribeRoomState(roomId: string, cb: (state: Record<string, unknown>) => void): () => void;
    subscribeRoomUsers(roomId: string, cb: (users: RoomUser[]) => void): () => void;
    onRoomMessage(roomId: string, type: string, cb: (message: unknown) => void): () => void;
  }
  // localTransport.ts
  export class LocalTransport implements MatchTransport { constructor(world: LocalWorld, account: string, now?: () => number) }
  // verse8Transport.ts
  export class Verse8Transport implements MatchTransport { constructor(server: Verse8Server) }
  export type Verse8Server = Pick<GameServer, "account" | "remoteFunction" | "subscribeRoomState" | "subscribeRoomAllUserStates" | "onRoomMessage">;
  ```
- 규칙
  - `needResponse: false`면 결과·오류를 기다리지 않고 `undefined`로 바로 끝난다(오류는 삼킴). Verse8 SDK와 같은 동작.
  - `throttle`: 같은 키(기본은 함수 이름)의 호출이 창 안에 또 오면 보내지 않고 `undefined`.
  - `LocalTransport`는 `findMatch` 결과로 현재 방을 기억하고 `leaveMatch` 뒤 잊는다. 메시지는 방이 같고 수신자가 없거나(전체) 자신인 것만 전달한다.

- [ ] **Step 1: 실패하는 테스트** — `tests/net/transport.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { Server } from "../../server/src/server";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";
import { CallThrottle } from "../../src/net/throttle";
import { Verse8Transport, type Verse8Server } from "../../src/net/verse8Transport";

describe("CallThrottle", () => {
  it("lets one call through per window, per key", () => {
    const t = new CallThrottle();
    expect(t.allow("a", 100, 0)).toBe(true);
    expect(t.allow("a", 100, 99)).toBe(false);
    expect(t.allow("b", 100, 99)).toBe(true);
    expect(t.allow("a", 100, 100)).toBe(true);
  });
});

describe("LocalTransport", () => {
  it("remembers the room from findMatch and forgets it after leaveMatch", async () => {
    const world = new LocalWorld(new Server());
    const t = new LocalTransport(world, "test-a");
    const { roomId } = await t.call<{ roomId: string }>("findMatch");
    const snap = await t.call<{ roomId: string }>("getMatchState");
    expect(snap.roomId).toBe(roomId);
    await t.call("leaveMatch");
    await expect(t.call("getMatchState")).rejects.toThrow("unavailable");
  });

  it("does not wait for or report errors when no response is needed", async () => {
    const world = new LocalWorld(new Server());
    const t = new LocalTransport(world, "test-a");
    await expect(t.call("escape", [], { needResponse: false })).resolves.toBeUndefined();
    await world.idle();
  });

  it("drops calls inside the throttle window", async () => {
    let now = 0;
    const world = new LocalWorld(new Server());
    const spy = vi.spyOn(world, "call");
    const t = new LocalTransport(world, "test-a", () => now);
    await t.call("getServerVersion", [], { throttle: 100 });
    await t.call("getServerVersion", [], { throttle: 100 });
    now = 100;
    await t.call("getServerVersion", [], { throttle: 100 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("delivers room messages meant for this account or everyone", async () => {
    const world = new LocalWorld(new Server());
    const a = new LocalTransport(world, "test-a");
    const got: unknown[] = [];
    a.onRoomMessage("r1", "hello", (m) => got.push(m));
    const emit = (world as unknown as { listeners: Set<(e: unknown) => void> }).listeners;
    for (const l of emit) {
      l({ kind: "message", roomId: "r1", to: null, type: "hello", message: 1 });
      l({ kind: "message", roomId: "r1", to: "test-a", type: "hello", message: 2 });
      l({ kind: "message", roomId: "r1", to: "test-b", type: "hello", message: 3 });
      l({ kind: "message", roomId: "r2", to: null, type: "hello", message: 4 });
      l({ kind: "message", roomId: "r1", to: null, type: "other", message: 5 });
    }
    expect(got).toEqual([1, 2]);
  });

  it("passes room state and user lists for its room", async () => {
    const world = new LocalWorld(new Server());
    const a = new LocalTransport(world, "test-a");
    const states: Record<string, unknown>[] = [];
    const users: unknown[][] = [];
    const { roomId } = await a.call<{ roomId: string }>("findMatch");
    a.subscribeRoomState(roomId, (s) => states.push(s));
    a.subscribeRoomUsers(roomId, (u) => users.push(u));
    await a.call("reportPose", [{ x: 1, z: 2, yaw: 0 }]);
    await a.call("syncMatch");
    expect(users.at(-1)).toMatchObject([{ account: "test-a", pose: { x: 1, z: 2, yaw: 0 } }]);
    expect(states.at(-1)).toMatchObject({ roomId });
  });
});

describe("Verse8Transport", () => {
  it("forwards everything to the Verse8 SDK", async () => {
    const off = () => {};
    const server = {
      account: "0xabc",
      remoteFunction: vi.fn(async () => "ok"),
      subscribeRoomState: vi.fn(() => off),
      subscribeRoomAllUserStates: vi.fn(() => off),
      onRoomMessage: vi.fn(() => off),
    };
    const t = new Verse8Transport(server as unknown as Verse8Server);
    expect(t.account).toBe("0xabc");
    await expect(t.call("reportPose", [1], { needResponse: false, throttle: 100 })).resolves.toBe("ok");
    expect(server.remoteFunction).toHaveBeenCalledWith("reportPose", [1], { needResponse: false, throttle: 100 });
    const cb = () => {};
    expect(t.subscribeRoomState("r", cb)).toBe(off);
    expect(t.subscribeRoomUsers("r", cb)).toBe(off);
    expect(t.onRoomMessage("r", "pain", cb)).toBe(off);
    expect(server.subscribeRoomState).toHaveBeenCalledWith("r", cb);
    expect(server.subscribeRoomAllUserStates).toHaveBeenCalledWith("r", cb);
    expect(server.onRoomMessage).toHaveBeenCalledWith("r", "pain", cb);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/net/transport.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 3: 구현**

`src/net/throttle.ts`:
```ts
export class CallThrottle {
  private readonly last = new Map<string, number>();

  allow(key: string, windowMs: number, now: number): boolean {
    const previous = this.last.get(key);
    if (previous !== undefined && now - previous < windowMs) return false;
    this.last.set(key, now);
    return true;
  }
}
```

`src/net/transport.ts`:
```ts
export interface CallOptions {
  needResponse?: boolean;
  throttle?: number;
  throttleKey?: string;
}

export interface RoomUser {
  account: string;
  pose?: { x: number; z: number; yaw: number; at?: number };
}

export interface MatchTransport {
  readonly account: string;
  call<T = unknown>(name: string, args?: unknown[], options?: CallOptions): Promise<T>;
  subscribeRoomState(roomId: string, cb: (state: Record<string, unknown>) => void): () => void;
  subscribeRoomUsers(roomId: string, cb: (users: RoomUser[]) => void): () => void;
  onRoomMessage(roomId: string, type: string, cb: (message: unknown) => void): () => void;
}
```

`src/net/localTransport.ts`:
```ts
import type { LocalWorld } from "./local/localWorld";
import { CallThrottle } from "./throttle";
import type { CallOptions, MatchTransport, RoomUser } from "./transport";

export class LocalTransport implements MatchTransport {
  private roomId: string | null = null;
  private readonly throttle = new CallThrottle();

  constructor(
    private readonly world: LocalWorld,
    readonly account: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  call<T = unknown>(name: string, args: unknown[] = [], options: CallOptions = {}): Promise<T> {
    if (options.throttle && !this.throttle.allow(options.throttleKey ?? name, options.throttle, this.now())) {
      return Promise.resolve(undefined as T);
    }
    const pending = this.world.call(this.account, this.roomId, name, args).then((result) => {
      if (name === "findMatch") this.roomId = (result as { roomId: string }).roomId;
      if (name === "leaveMatch") this.roomId = null;
      return result as T;
    });
    if (options.needResponse === false) {
      pending.catch(() => undefined);
      return Promise.resolve(undefined as T);
    }
    return pending;
  }

  subscribeRoomState(roomId: string, cb: (state: Record<string, unknown>) => void): () => void {
    return this.world.subscribe((e) => {
      if (e.kind === "roomState" && e.roomId === roomId) cb(e.state);
    });
  }

  subscribeRoomUsers(roomId: string, cb: (users: RoomUser[]) => void): () => void {
    return this.world.subscribe((e) => {
      if (e.kind === "roomUsers" && e.roomId === roomId) cb(e.users as RoomUser[]);
    });
  }

  onRoomMessage(roomId: string, type: string, cb: (message: unknown) => void): () => void {
    return this.world.subscribe((e) => {
      if (e.kind === "message" && e.roomId === roomId && e.type === type && (e.to === null || e.to === this.account)) {
        cb(e.message);
      }
    });
  }
}
```

`src/net/verse8Transport.ts`:
```ts
import type { GameServer } from "@agent8/gameserver";
import type { CallOptions, MatchTransport, RoomUser } from "./transport";

export type Verse8Server = Pick<
  GameServer, "account" | "remoteFunction" | "subscribeRoomState" | "subscribeRoomAllUserStates" | "onRoomMessage"
>;

export class Verse8Transport implements MatchTransport {
  constructor(private readonly server: Verse8Server) {}

  get account(): string {
    return this.server.account;
  }

  call<T = unknown>(name: string, args: unknown[] = [], options: CallOptions = {}): Promise<T> {
    return this.server.remoteFunction(name, args, options) as Promise<T>;
  }

  subscribeRoomState(roomId: string, cb: (state: Record<string, unknown>) => void): () => void {
    return this.server.subscribeRoomState(roomId, cb);
  }

  subscribeRoomUsers(roomId: string, cb: (users: RoomUser[]) => void): () => void {
    return this.server.subscribeRoomAllUserStates(roomId, cb);
  }

  onRoomMessage(roomId: string, type: string, cb: (message: unknown) => void): () => void {
    return this.server.onRoomMessage(roomId, type, cb);
  }
}
```


- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/net/transport.test.ts && npm test && npm run typecheck`
Expected: transport 7 PASS, 전체 125 PASS, 타입 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/net/throttle.ts src/net/transport.ts src/net/localTransport.ts src/net/verse8Transport.ts tests/net/transport.test.ts
git commit -m "feat: match transports for practice mode and the Verse8 server"
```

---

### Task 5: MatchClient (화면용 매치 상태 + 행동 호출)

**Files:**
- Modify: `src/game/match/types.ts` (오류 코드 목록을 값으로도 내보냄)
- Create: `src/net/matchClient.ts`
- Test: `tests/net/matchClient.test.ts`

**Interfaces:**
- Consumes: `MatchTransport` (Task 4), `PublicMatch`, `PrivateView`, `isActive`, `MonsterPoseUpdate`, `PROTOCOL_VERSION`
- Produces:
  ```ts
  // types.ts
  export const RULE_ERRORS: readonly RuleError[]    // RuleError 타입은 이 배열에서 만든다
  // matchClient.ts
  export type ClientPhase = "idle" | "searching" | "lobby" | "playing" | "ended" | "error";
  export interface MatchSnapshot { roomId: string; serverNow: number; match: PublicMatch; you: PrivateView }
  export interface ClientState { phase: ClientPhase; roomId: string | null; match: PublicMatch | null; you: PrivateView; poses: Record<string, Pose>; error: string | null }
  export interface PainEvent { x: number; z: number }
  export interface PossessionEvent { monsterId: string; active: boolean; endsAt: number | null }
  export const NO_VIEW: PrivateView;
  export const POSE_THROTTLE_MS = 100; export const MONSTER_THROTTLE_MS = 150; export const SYNC_INTERVAL_MS = 1000;
  export function errorCode(error: unknown): string;     // 메시지 안의 규칙 오류 코드, 없으면 메시지
  export class MatchClient {
    constructor(transport: MatchTransport, now?: () => number);
    readonly account: string;
    readonly state: ClientState;
    serverNow(): number;
    onChange(cb: (s: ClientState) => void): () => void;
    onPain(cb: (e: PainEvent) => void): () => void;
    onPossession(cb: (e: PossessionEvent) => void): () => void;
    join(): Promise<void>;
    refresh(): Promise<void>;
    host(): string | null;                              // 첫 번째 활동 플레이어
    tick(): void;                                       // 매 프레임: 1초마다 syncMatch
    reportPose(pose: Pose): void;
    reportMonsters(updates: MonsterPoseUpdate[]): void; // 내 화면의 몬스터 위치도 즉시 반영
    possess(monsterId: string): Promise<string | null>; // 오류 코드 또는 null
    release(): Promise<string | null>;
    fireAtMonster(monsterId: string): Promise<string | null>;
    fireAtPlayer(target: string): Promise<string | null>;
    attackWithMonster(monsterId: string, target: string): Promise<string | null>;
    escape(): Promise<string | null>;
    advanceClock(ms: number): Promise<string | null>;  // 연습 모드 디버그 전용(test- 계정)
    leave(): Promise<void>;
    dispose(): void;
  }
  ```
- 규칙
  - 방 상태가 `playing`인데 내 역할을 아직 모르면(로비에서 기다리다 시작된 경우) `getMatchState`를 한 번 다시 불러 역할을 받는다.
  - 서버 시각 = 내 시각 + (서버가 준 `serverNow` − 요청 전후 평균 시각).
  - 내가 0.5초 안에 보고한 몬스터는 방 상태가 와도 내 화면의 위치를 유지한다(보고는 150ms마다만 가므로 되돌아가 보이는 것을 막음).
  - 판이 끝난 뒤에는 역할을 다시 받지 않는다(서버가 비밀을 지워서 `null`이 오기 때문).

- [ ] **Step 1: 오류 코드 목록** — `src/game/match/types.ts`

`RuleError` 타입 선언을 교체:
```ts
export const RULE_ERRORS = [
  "not_playing", "not_traitor", "not_ready", "already_possessing", "not_possessing",
  "unavailable", "no_monster", "monster_dead", "out_of_range", "too_fast",
  "not_authority", "stunned", "no_target", "not_at_exit", "match_full",
] as const;

export type RuleError = (typeof RULE_ERRORS)[number];
```

- [ ] **Step 2: 실패하는 테스트** — `tests/net/matchClient.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { Server } from "../../server/src/server";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";
import { MatchClient, SYNC_INTERVAL_MS, errorCode } from "../../src/net/matchClient";
import type { MatchTransport } from "../../src/net/transport";

const PLAYERS = ["test-a", "test-b", "test-c", "test-d"];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function settle(world: LocalWorld): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await world.idle();
    await flush();
  }
}

async function joinAll(world: LocalWorld, now?: () => number): Promise<MatchClient[]> {
  const clients = PLAYERS.map((p) => new MatchClient(new LocalTransport(world, p), now));
  for (const c of clients) await c.join();
  await settle(world);
  return clients;
}

function traitorOf(clients: MatchClient[]): MatchClient {
  return clients.find((c) => c.state.you.role === "traitor")!;
}

describe("MatchClient", () => {
  it("waits in the lobby until four players are in", async () => {
    const world = new LocalWorld(new Server());
    const solo = new MatchClient(new LocalTransport(world, "test-solo"));
    await solo.join();
    expect(solo.state.phase).toBe("lobby");
    expect(solo.state.you.role).toBeNull();
  });

  it("starts the match and tells every player their role, including those who joined early", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    expect(clients.map((c) => c.state.phase)).toEqual(["playing", "playing", "playing", "playing"]);
    expect(new Set(clients.map((c) => c.state.roomId)).size).toBe(1);
    expect(clients.filter((c) => c.state.you.role === "traitor")).toHaveLength(1);
    expect(clients.every((c) => c.state.you.hp === 100)).toBe(true);
    expect(Math.abs(clients[0].serverNow() - Date.now())).toBeLessThan(1000);
  });

  it("turns server errors into codes", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    const adventurer = clients.find((c) => c.state.you.role === "adventurer")!;
    expect(await adventurer.possess("zombie-0")).toBe("not_traitor");
    expect(errorCode(new Error("RuleViolation: out_of_range"))).toBe("out_of_range");
    expect(errorCode("something else")).toBe("something else");
  });

  it("tracks other players' reported poses, throttled", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    clients[0].reportPose({ x: 6, z: 6, yaw: 1 });
    clients[0].reportPose({ x: 7, z: 7, yaw: 1 });
    await settle(world);
    expect(clients[1].state.poses["test-a"]).toEqual({ x: 6, z: 6, yaw: 1 });
  });

  it("applies private updates to the player they are for", async () => {
    const world = new LocalWorld(new Server());
    const [a, b] = await joinAll(world);
    a.reportPose({ x: 6, z: 6, yaw: 0 });
    b.reportPose({ x: 6, z: 9, yaw: 0 });
    await settle(world);
    expect(await a.fireAtPlayer("test-b")).toBeNull();
    await settle(world);
    expect(b.state.you.hp).toBe(66);
    expect(a.state.you.hp).toBe(100);
  });

  it("hears screams and possession changes", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    const traitor = traitorOf(clients);
    const shooter = clients.find((c) => c !== traitor)!;
    const pains: unknown[] = [];
    const possessions: unknown[] = [];
    shooter.onPain((e) => pains.push(e));
    shooter.onPossession((e) => possessions.push(e));
    traitor.reportPose({ x: 30, z: 14, yaw: 0 });
    shooter.reportPose({ x: 34, z: 20, yaw: 0 });
    await settle(world);
    expect(await traitor.advanceClock(60_000)).toBeNull();
    expect(await traitor.possess("zombie-0")).toBeNull();
    expect(traitor.state.you.possession?.monsterId).toBe("zombie-0");
    expect(await shooter.fireAtMonster("zombie-0")).toBeNull();
    await settle(world);
    expect(pains).toEqual([{ x: 30, z: 14 }]);
    expect(possessions).toHaveLength(1);
    expect(possessions[0]).toMatchObject({ monsterId: "zombie-0", active: true });
  });

  it("sends syncMatch once per interval while playing", async () => {
    let now = 0;
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world, () => now);
    const transport = (clients[0] as unknown as { transport: MatchTransport }).transport;
    const spy = vi.spyOn(transport, "call");
    clients[0].tick();
    clients[0].tick();
    now += SYNC_INTERVAL_MS;
    clients[0].tick();
    expect(spy.mock.calls.filter(([name]) => name === "syncMatch")).toHaveLength(2);
  });

  it("names the first active player as host", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    expect(clients[1].host()).toBe("test-a");
    await clients[0].leave();
    await settle(world);
    expect(clients[1].host()).toBe("test-b");
    expect(clients[0].state.phase).toBe("idle");
    expect(clients[0].state.match).toBeNull();
  });

  it("keeps the monster positions it just reported over slower room updates", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    const host = clients[0];
    host.reportMonsters([{ id: "zombie-0", x: 34, z: 15, yaw: 0 }]);
    host.reportMonsters([{ id: "zombie-0", x: 34, z: 16, yaw: 0 }]);
    expect(host.state.match!.monsters["zombie-0"].z).toBe(16);
    await settle(world);
    await clients[1].refresh();
    clients[1].tick();
    await settle(world);
    expect(host.state.match!.monsters["zombie-0"].z).toBe(16);
    expect(world.roomState(host.state.roomId!).match.monsters["zombie-0"].z).toBe(15);
  });

  it("fails clearly on a protocol mismatch", async () => {
    const transport: MatchTransport = {
      account: "x",
      call: async <T,>() => ({ protocol: 999 }) as T,
      subscribeRoomState: () => () => {},
      subscribeRoomUsers: () => () => {},
      onRoomMessage: () => () => {},
    };
    const client = new MatchClient(transport);
    await client.join();
    expect(client.state.phase).toBe("error");
    expect(client.state.error).toContain("protocol");
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/net/matchClient.test.ts`
Expected: FAIL — `Cannot find module '../../src/net/matchClient'`

- [ ] **Step 4: 구현** — `src/net/matchClient.ts`

```ts
import { PROTOCOL_VERSION } from "../game/match/constants";
import type { MonsterPoseUpdate } from "../game/match/damage";
import { isActive } from "../game/match/lifecycle";
import { RULE_ERRORS, type Pose, type PublicMatch } from "../game/match/types";
import type { PrivateView } from "../game/match/view";
import type { MatchTransport, RoomUser } from "./transport";

export type ClientPhase = "idle" | "searching" | "lobby" | "playing" | "ended" | "error";

export interface MatchSnapshot {
  roomId: string;
  serverNow: number;
  match: PublicMatch;
  you: PrivateView;
}

export interface ClientState {
  phase: ClientPhase;
  roomId: string | null;
  match: PublicMatch | null;
  you: PrivateView;
  poses: Record<string, Pose>;
  error: string | null;
}

export interface PainEvent { x: number; z: number }
export interface PossessionEvent { monsterId: string; active: boolean; endsAt: number | null }

export const NO_VIEW: PrivateView = { role: null, hp: null, possession: null, possessReadyAt: null };
export const POSE_THROTTLE_MS = 100;
export const MONSTER_THROTTLE_MS = 150;
export const SYNC_INTERVAL_MS = 1000;
const OWN_MONSTER_HOLD_MS = 500;

export function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
  return RULE_ERRORS.find((code) => message.includes(code)) ?? message;
}

function isPose(value: unknown): value is Pose {
  const p = value as Partial<Pose> | undefined;
  return !!p && [p.x, p.z, p.yaw].every((n) => typeof n === "number" && Number.isFinite(n));
}

export class MatchClient {
  private current: ClientState = { phase: "idle", roomId: null, match: null, you: NO_VIEW, poses: {}, error: null };
  private offsetMs = 0;
  private lastSyncAt = -Infinity;
  private refreshing = false;
  private unsubscribers: (() => void)[] = [];
  private readonly reported = new Map<string, number>();
  private readonly changeListeners = new Set<(s: ClientState) => void>();
  private readonly painListeners = new Set<(e: PainEvent) => void>();
  private readonly possessionListeners = new Set<(e: PossessionEvent) => void>();

  constructor(
    private readonly transport: MatchTransport,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get account(): string {
    return this.transport.account;
  }

  get state(): ClientState {
    return this.current;
  }

  serverNow(): number {
    return this.now() + this.offsetMs;
  }

  onChange(cb: (s: ClientState) => void): () => void {
    this.changeListeners.add(cb);
    return () => {
      this.changeListeners.delete(cb);
    };
  }

  onPain(cb: (e: PainEvent) => void): () => void {
    this.painListeners.add(cb);
    return () => {
      this.painListeners.delete(cb);
    };
  }

  onPossession(cb: (e: PossessionEvent) => void): () => void {
    this.possessionListeners.add(cb);
    return () => {
      this.possessionListeners.delete(cb);
    };
  }

  async join(): Promise<void> {
    this.set({ phase: "searching", error: null });
    try {
      const version = await this.transport.call<{ protocol: number }>("getServerVersion");
      if (version?.protocol !== PROTOCOL_VERSION) {
        throw new Error(`server protocol ${version?.protocol}, client protocol ${PROTOCOL_VERSION}`);
      }
      const { roomId } = await this.transport.call<{ roomId: string }>("findMatch");
      this.set({ roomId });
      this.listen(roomId);
      await this.refresh();
    } catch (error) {
      this.fail(error);
    }
  }

  async refresh(): Promise<void> {
    if (!this.current.roomId) return;
    const sentAt = this.now();
    const snap = await this.transport.call<MatchSnapshot>("getMatchState");
    const receivedAt = this.now();
    this.offsetMs = snap.serverNow - (sentAt + receivedAt) / 2;
    const you = snap.match.phase === "ended" && this.current.you.role ? this.current.you : snap.you;
    this.set({ roomId: snap.roomId, match: this.keepOwnMonsters(snap.match), you, phase: snap.match.phase });
  }

  host(): string | null {
    const match = this.current.match;
    return match ? (match.players.find((p) => isActive(match, p)) ?? null) : null;
  }

  tick(): void {
    if (this.current.phase !== "playing") return;
    const now = this.now();
    if (now - this.lastSyncAt < SYNC_INTERVAL_MS) return;
    this.lastSyncAt = now;
    void this.transport.call("syncMatch", [], { needResponse: false });
  }

  reportPose(pose: Pose): void {
    if (this.current.phase !== "playing" && this.current.phase !== "lobby") return;
    void this.transport.call("reportPose", [{ x: pose.x, z: pose.z, yaw: pose.yaw }], {
      needResponse: false, throttle: POSE_THROTTLE_MS,
    });
  }

  reportMonsters(updates: MonsterPoseUpdate[]): void {
    const match = this.current.match;
    if (updates.length === 0 || this.current.phase !== "playing" || !match) return;
    const monsters = { ...match.monsters };
    const now = this.now();
    for (const u of updates) {
      const monster = monsters[u.id];
      if (!monster) continue;
      monsters[u.id] = { ...monster, x: u.x, z: u.z, yaw: u.yaw };
      this.reported.set(u.id, now);
    }
    this.set({ match: { ...match, monsters } });
    void this.transport.call("reportMonsters", [updates], { needResponse: false, throttle: MONSTER_THROTTLE_MS });
  }

  possess(monsterId: string): Promise<string | null> {
    return this.actWithView("possess", [monsterId]);
  }

  release(): Promise<string | null> {
    return this.actWithView("release", []);
  }

  fireAtMonster(monsterId: string): Promise<string | null> {
    return this.act("fireAtMonster", [monsterId]);
  }

  fireAtPlayer(target: string): Promise<string | null> {
    return this.act("fireAtPlayer", [target]);
  }

  attackWithMonster(monsterId: string, target: string): Promise<string | null> {
    return this.act("attackWithMonster", [monsterId, target]);
  }

  escape(): Promise<string | null> {
    return this.act("escape", []);
  }

  advanceClock(ms: number): Promise<string | null> {
    return this.act("devAdvanceClock", [ms]);
  }

  async leave(): Promise<void> {
    try {
      if (this.current.roomId) await this.transport.call("leaveMatch");
    } catch {
      // Leaving is best effort: the server counts a vanished player as gone anyway.
    } finally {
      this.stopListening();
      this.set({ phase: "idle", roomId: null, match: null, you: NO_VIEW, poses: {}, error: null });
    }
  }

  dispose(): void {
    this.stopListening();
    this.changeListeners.clear();
    this.painListeners.clear();
    this.possessionListeners.clear();
  }

  private async act(name: string, args: unknown[]): Promise<string | null> {
    try {
      await this.transport.call(name, args);
      return null;
    } catch (error) {
      return errorCode(error);
    }
  }

  private async actWithView(name: string, args: unknown[]): Promise<string | null> {
    try {
      const view = await this.transport.call<PrivateView>(name, args);
      this.set({ you: view });
      return null;
    } catch (error) {
      return errorCode(error);
    }
  }

  private listen(roomId: string): void {
    this.stopListening();
    const t = this.transport;
    this.unsubscribers = [
      t.subscribeRoomState(roomId, (state) => this.onRoomState(state)),
      t.subscribeRoomUsers(roomId, (users) => this.onUsers(users)),
      t.onRoomMessage(roomId, "private", (m) => this.set({ you: m as PrivateView })),
      t.onRoomMessage(roomId, "pain", (m) => this.painListeners.forEach((l) => l(m as PainEvent))),
      t.onRoomMessage(roomId, "possession", (m) => this.possessionListeners.forEach((l) => l(m as PossessionEvent))),
    ];
  }

  private stopListening(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
  }

  private onRoomState(state: Record<string, unknown>): void {
    const match = state.match as PublicMatch | undefined;
    if (!match || match.version !== 1) return;
    this.set({ match: this.keepOwnMonsters(match), phase: match.phase });
    if (match.phase === "playing" && this.current.you.role === null && !this.refreshing) {
      this.refreshing = true;
      this.refresh()
        .catch((error) => this.fail(error))
        .finally(() => {
          this.refreshing = false;
        });
    }
  }

  private onUsers(users: RoomUser[]): void {
    const poses: Record<string, Pose> = {};
    for (const user of users) {
      if (isPose(user.pose)) poses[user.account] = { x: user.pose.x, z: user.pose.z, yaw: user.pose.yaw };
    }
    this.set({ poses });
  }

  private keepOwnMonsters(match: PublicMatch): PublicMatch {
    const local = this.current.match;
    if (!local) return match;
    const now = this.now();
    let monsters = match.monsters;
    for (const [id, at] of this.reported) {
      if (now - at >= OWN_MONSTER_HOLD_MS) {
        this.reported.delete(id);
        continue;
      }
      const mine = local.monsters[id];
      const theirs = monsters[id];
      if (!mine || !theirs) continue;
      if (monsters === match.monsters) monsters = { ...match.monsters };
      monsters[id] = { ...theirs, x: mine.x, z: mine.z, yaw: mine.yaw };
    }
    return monsters === match.monsters ? match : { ...match, monsters };
  }

  private set(patch: Partial<ClientState>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of this.changeListeners) listener(this.current);
  }

  private fail(error: unknown): void {
    this.set({ phase: "error", error: error instanceof Error ? error.message : String(error) });
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/net/matchClient.test.ts && npm test && npm run typecheck && npm run server:typecheck && npm run server:test`
Expected: matchClient 10 PASS, 전체 135 PASS, 타입 에러 없음, 서버 테스트 20 PASS(`types.ts` 변경 확인).

- [ ] **Step 6: 커밋**

```bash
git add src/game/match/types.ts src/net/matchClient.ts tests/net/matchClient.test.ts
git commit -m "feat: match client state, clock sync and action calls"
```

---

### Task 6: 몬스터 지휘(HostDirector), 봇(BotBrain), 연습 세션

**Files:**
- Create: `src/net/hostDirector.ts`
- Create: `src/game/bots/botBrain.ts`
- Create: `src/net/practice.ts`
- Test: `tests/bots/botMatch.test.ts`

**Interfaces:**
- Consumes: `MatchClient` (Task 5), `stepMonsterAi`, `ZOMBIE_SPEED` (Task 2), `findPath`, `spawnPoint`, `stepPlayer` (Task 1), `wallDistance` (`src/game/rules/combat.ts`), `LocalWorld`, `LocalTransport`, `Server`
- Produces:
  ```ts
  // hostDirector.ts
  export class HostDirector {
    constructor(client: MatchClient, layout: LevelLayout);
    update(dt: number, ownPose: Pose | null): void;   // 내가 호스트일 때만 몬스터 AI를 돌리고 보고·공격 요청
  }
  // botBrain.ts
  export class BotBrain {
    pose: Pose | null;                                // 봇 본체 위치 (첫 update에서 시작 자리로 정해짐)
    constructor(client: MatchClient, layout: LevelLayout);
    update(dt: number): void;
  }
  // practice.ts
  export const PRACTICE_BOTS = 3;
  export const PRACTICE_ACCOUNT = "test-you";
  export interface PracticeOptions { bots?: number; autopilot?: boolean }   // autopilot: 사람 자리도 봇이 조종(테스트·관전용)
  export class PracticeSession {
    readonly world: LocalWorld;
    readonly human: MatchClient;
    constructor(layout: LevelLayout, options?: PracticeOptions);
    start(): Promise<void>;                           // 사람 먼저 입장 → 봇 입장 → 1초마다 $roomTick
    update(dt: number, humanPose: Pose | null): void; // 매 프레임
    dispose(): void;
  }
  ```
- 봇 규칙
  - 모험가: 12m 안에 보이는(벽에 가리지 않은) 몬스터가 있으면 그쪽을 보고 0.4초마다 쏜다. 없으면 길찾기로 탈출구에 가서 `escape`.
  - 배신자: 빙의 중이면 그 몬스터를 가장 가까운 모험가 쪽으로 몰고, 붙으면 공격. 아니면 가장 가까운 몬스터 근처(빙의 거리 안)로 걸어가 준비되면 빙의. 몬스터가 없으면 탈출구 쪽으로 걷기만 하고 탈출은 하지 않는다.
  - 한 번에 행동 호출 하나만 보낸다(응답이 오기 전에는 다음 행동을 보내지 않음). 빙의 중에는 본체 위치를 보고하지 않는다.

- [ ] **Step 1: 실패하는 테스트** — `tests/bots/botMatch.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEVEL_1, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";
import { PracticeSession } from "../../src/net/practice";

const layout = parseLevel(LEVEL_1, TILE_SIZE);
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

  it("plays a whole match to the end with bots on every seat", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const session = new PracticeSession(layout, { autopilot: true });
    await session.start();
    const endedAt = await runUntilEnd(session, 9 * 60);
    session.dispose();

    expect(endedAt).toBeLessThan(9 * 60);
    const match = session.human.state.match!;
    expect(match.phase).toBe("ended");
    expect(["escaped", "wiped", "timeout"]).toContain(match.result!.reason);
    expect(match.results).toHaveLength(4);
    const moved = Object.values(match.monsters).some((m) => m.x !== 34 || m.z !== 14);
    expect(moved || match.result!.reason === "escaped").toBe(true);
  }, 60_000);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/bots/botMatch.test.ts`
Expected: FAIL — `Cannot find module '../../src/net/practice'`

- [ ] **Step 3: 구현** — `src/net/hostDirector.ts`

```ts
import { stepMonsterAi } from "../game/match/monsterAi";
import type { Pose, Poses } from "../game/match/types";
import { solidAt, type LevelLayout } from "../game/rules/levelLayout";
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
    const step = stepMonsterAi(match, all, (x, z) => solidAt(this.layout, x, z), dt, this.client.serverNow(), () => false);
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

- [ ] **Step 4: 구현** — `src/game/bots/botBrain.ts`

```ts
import type { MatchClient } from "../../net/matchClient";
import { EXIT_RADIUS, POSSESS_RANGE, ZOMBIE_ATTACK_RANGE } from "../match/constants";
import { isActive } from "../match/lifecycle";
import { ZOMBIE_SPEED } from "../match/monsterAi";
import type { MonsterState, Pose, PublicMatch, Vec2 } from "../match/types";
import { distance } from "../match/view";
import { wallDistance } from "../rules/combat";
import { solidAt, spawnPoint, type LevelLayout } from "../rules/levelLayout";
import { EYE_HEIGHT, WALK_SPEED, stepPlayer } from "../rules/movement";
import { findPath } from "../rules/pathfinding";

const SHOOT_RANGE = 12;
const BOT_FIRE_INTERVAL_MS = 400;
const REPATH_MS = 1000;
const WAYPOINT_REACHED = 0.3;

function yawTo(from: Vec2, to: Vec2): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export class BotBrain {
  pose: Pose | null = null;
  private path: Vec2[] = [];
  private pathGoal: Vec2 | null = null;
  private pathAt = Number.NEGATIVE_INFINITY;
  private lastShotAt = Number.NEGATIVE_INFINITY;
  private busy = false;
  private readonly isSolid: (x: number, z: number) => boolean;

  constructor(
    private readonly client: MatchClient,
    private readonly layout: LevelLayout,
  ) {
    this.isSolid = (x, z) => solidAt(layout, x, z);
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

    const now = this.client.serverNow();
    if (you.role === "traitor") this.traitorStep(match, dt, now);
    else this.adventurerStep(match, dt, now);
    if (!this.client.state.you.possession) this.client.reportPose(this.pose);
  }

  private adventurerStep(match: PublicMatch, dt: number, now: number): void {
    const pose = this.pose!;
    const target = this.nearestMonster(match, pose, SHOOT_RANGE, true);
    if (target) {
      pose.yaw = yawTo(pose, target.monster);
      if (now - this.lastShotAt >= BOT_FIRE_INTERVAL_MS && this.run(() => this.client.fireAtMonster(target.id))) {
        this.lastShotAt = now;
      }
      return;
    }
    const exit = this.layout.exits[0];
    if (distance(pose, exit) <= EXIT_RADIUS * 0.8) {
      this.run(() => this.client.escape());
      return;
    }
    this.walkTo(exit, dt, now);
  }

  private traitorStep(match: PublicMatch, dt: number, now: number): void {
    const { you } = this.client.state;
    if (you.possession) {
      this.driveMonster(match, you.possession.monsterId, dt, now);
      return;
    }
    const pose = this.pose!;
    const nearest = this.nearestMonster(match, pose, Number.POSITIVE_INFINITY, false);
    if (!nearest) {
      this.walkTo(this.layout.exits[0], dt, now);
      return;
    }
    const ready = you.possessReadyAt !== null && now >= you.possessReadyAt;
    if (ready && nearest.distance <= POSSESS_RANGE - 1) {
      this.run(() => this.client.possess(nearest.id));
      return;
    }
    if (nearest.distance > POSSESS_RANGE - 2) this.walkTo(nearest.monster, dt, now);
  }

  private driveMonster(match: PublicMatch, monsterId: string, dt: number, now: number): void {
    const monster = match.monsters[monsterId];
    if (!monster || !monster.alive) return;
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
    if (best.d > ZOMBIE_ATTACK_RANGE * 0.8) {
      const moved = stepPlayer({ x: monster.x, z: monster.z, yaw }, { forward: 1, strafe: 0 }, dt, this.isSolid, ZOMBIE_SPEED * 1.2);
      this.client.reportMonsters([{ id: monsterId, x: moved.x, z: moved.z, yaw }]);
    } else if (now >= monster.attackReadyAt) {
      const victim = best;
      this.run(() => this.client.attackWithMonster(monsterId, victim.account));
    }
  }

  private nearestMonster(
    match: PublicMatch, from: Vec2, range: number, mustSee: boolean,
  ): { id: string; monster: MonsterState; distance: number } | null {
    let best: { id: string; monster: MonsterState; distance: number } | null = null;
    for (const [id, monster] of Object.entries(match.monsters)) {
      if (!monster.alive || monster.possessed) continue;
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
    return wallDistance(ray, this.isSolid, d, this.layout.tileSize) >= d;
  }

  private walkTo(goal: Vec2, dt: number, now: number): void {
    const pose = this.pose!;
    const stale = !this.pathGoal || distance(this.pathGoal, goal) > 1 || now - this.pathAt > REPATH_MS;
    if (stale || this.path.length === 0) {
      this.path = findPath(this.layout, pose, goal) ?? [];
      this.pathGoal = { x: goal.x, z: goal.z };
      this.pathAt = now;
    }
    while (this.path.length > 0 && distance(pose, this.path[0]) < WAYPOINT_REACHED) this.path.shift();
    const next = this.path[0];
    if (!next) return;
    const yaw = yawTo(pose, next);
    const speed = Math.min(WALK_SPEED, distance(pose, next) / Math.max(dt, 1e-3));
    this.pose = stepPlayer({ x: pose.x, z: pose.z, yaw }, { forward: 1, strafe: 0 }, dt, this.isSolid, speed);
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

- [ ] **Step 5: 구현** — `src/net/practice.ts`

```ts
import { Server } from "../../server/src/server";
import { BotBrain } from "../game/bots/botBrain";
import type { Pose } from "../game/match/types";
import type { LevelLayout } from "../game/rules/levelLayout";
import { HostDirector } from "./hostDirector";
import { LocalWorld } from "./local/localWorld";
import { LocalTransport } from "./localTransport";
import { MatchClient } from "./matchClient";

export const PRACTICE_BOTS = 3;
export const PRACTICE_ACCOUNT = "test-you";
const ROOM_TICK_MS = 1000;

export interface PracticeOptions {
  bots?: number;
  autopilot?: boolean;
}

interface Seat {
  client: MatchClient;
  brain: BotBrain;
  director: HostDirector;
}

export class PracticeSession {
  readonly world = new LocalWorld(new Server());
  readonly human: MatchClient;
  private readonly humanDirector: HostDirector;
  private readonly autopilot: BotBrain | null;
  private readonly bots: Seat[] = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  // StrictMode disposes the first session while its start() is still running.
  private disposed = false;

  constructor(
    private readonly layout: LevelLayout,
    private readonly options: PracticeOptions = {},
  ) {
    this.human = new MatchClient(new LocalTransport(this.world, PRACTICE_ACCOUNT));
    this.humanDirector = new HostDirector(this.human, layout);
    this.autopilot = options.autopilot ? new BotBrain(this.human, layout) : null;
  }

  async start(): Promise<void> {
    await this.human.join();
    const count = this.options.bots ?? PRACTICE_BOTS;
    for (let i = 1; i <= count; i++) {
      const client = new MatchClient(new LocalTransport(this.world, `test-bot-${i}`));
      await client.join();
      this.bots.push({ client, brain: new BotBrain(client, this.layout), director: new HostDirector(client, this.layout) });
    }
    await this.world.idle();
    await this.human.refresh();
    if (this.disposed) return;
    this.tickTimer = setInterval(() => void this.world.tickAll(), ROOM_TICK_MS);
  }

  update(dt: number, humanPose: Pose | null): void {
    if (this.autopilot) this.autopilot.update(dt);
    this.humanDirector.update(dt, this.autopilot ? this.autopilot.pose : humanPose);
    this.human.tick();
    for (const seat of this.bots) {
      seat.brain.update(dt);
      seat.director.update(dt, seat.brain.pose);
      seat.client.tick();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.human.dispose();
    for (const seat of this.bots) seat.client.dispose();
  }
}
```

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run tests/bots/botMatch.test.ts && npm test && npm run typecheck`
Expected: botMatch 2 PASS, 전체 137 PASS, 타입 에러 없음.

실패하면: 두 번째 테스트가 `endedAt = Infinity`(9분 안에 안 끝남)면 봇이 어딘가에 끼인 것이다. `session`의 봇 위치를 1초마다 출력해 어느 칸에서 멈추는지 보고, 원인(길찾기 경로, 벽 미끄러짐, `busy`가 풀리지 않음)을 고친다. 서버 규칙은 바꾸지 않는다.

- [ ] **Step 7: 커밋**

```bash
git add src/net/hostDirector.ts src/game/bots/botBrain.ts src/net/practice.ts tests/bots/botMatch.test.ts
git commit -m "feat: host monster director, bots and a practice session"
```

---

### Task 7: 3D 매치 화면 (MatchView)

Plan 1의 `GameView`는 혼자 노는 화면이었다. 이것을 `MatchClient` 상태를 그리는 `MatchView`로 바꾼다. 3D 화면은 자동 테스트가 어려우므로 타입 검사 + 작업 8의 브라우저 확인으로 검증한다.

화면 규칙:
- 내 몸: 걷기(WASD)·시점(마우스)·사격(왼쪽 클릭, 100ms 간격). 쏠 때 화면에서 레이를 쏴 벽에 가리지 않은 몬스터·다른 플레이어를 고르고 `fireAtMonster`/`fireAtPlayer`를 보낸다(판정은 서버).
- `F`: 탈출구 2m 안이면 `escape`. 탈출구 칸에는 초록 빛 표시.
- 배신자 `E`: 12m 안 가장 가까운 몬스터에 `possess`. 빙의 중에는 카메라가 그 몬스터 눈높이(1.5m)로 가고, WASD로 몬스터를 움직여 `reportMonsters`, 왼쪽 클릭으로 2m 안의 가장 가까운 다른 플레이어를 `attackWithMonster`, `R`로 `release`. 빙의 중에는 내 본체 위치를 보고하지 않고, 내 본체는 제자리에 서 있는 모습으로 보인다.
- 다른 플레이어: `contract_killer` 모델, 대기·달리기·사망 동작, 탈출하면 사라짐.
- 몬스터: 서버 상태를 부드럽게 따라가고, 피가 줄면 붉게 번쩍, 죽으면 쓰러짐. 내가 조종 중인 몬스터는 숨김.
- 비명(`pain`)을 들으면 합성음 + HUD 표시.
- 호스트면 `onFrame`으로 받은 콜백(작업 8에서 `HostDirector`·연습 세션을 넘김)을 매 프레임 부른다.

**Files:**
- Create: `src/game/render/skinned.ts`, `src/game/render/MonsterActor.ts`, `src/game/render/RemotePlayerActor.ts`, `src/game/render/scream.ts`, `src/game/render/MatchView.ts`
- Modify: `src/game/render/FpsInput.ts`, `src/game/render/Viewmodel.ts`
- Delete: `src/game/render/GameView.ts`, `src/game/render/ZombieActor.ts`
- Modify: `src/App.tsx` (작업 8에서 전부 바꾸므로 여기서는 컴파일되게만 임시 수정)

**Interfaces:**
- Consumes: `MatchClient`, `ClientState` (Task 5), `ModelLibrary`, `Viewmodel`, 규칙 모듈
- Produces:
  ```ts
  // FpsInput.ts (추가)
  consumePress(code: string): boolean          // 키가 새로 눌렸으면 true를 한 번만 돌려줌
  // Viewmodel.ts (추가)
  setVisible(visible: boolean): void
  // MatchView.ts
  export const MATCH_MODELS: string[];
  export interface HudState {
    phase: ClientPhase; role: "adventurer" | "traitor" | null; hp: number | null;
    timeLeftMs: number | null; alive: boolean; escaped: boolean;
    possession: { monsterId: string; remainingMs: number } | null;
    possessReadyInMs: number | null; canPossess: boolean; nearExit: boolean;
    players: number; painAt: number | null; error: { code: string; at: number } | null;
    result: MatchResult | null; results: PlayerResult[] | null;
  }
  export interface MatchViewOptions {
    onProgress?: (done: number, total: number) => void;
    onFrame?: (dt: number, ownPose: Pose | null) => void;   // 활동 중이면 내 본체 위치(빙의 중이어도 본체)
  }
  export interface MatchDebugHandle {
    pose(): { x: number; z: number; yaw: number; pitch: number };
    setPose(p: { x: number; z: number; yaw: number; pitch?: number }): void;
    stats(): { triangles: number; calls: number };
    hud(): HudState | null;
    state(): ClientState;
    fire(): Promise<string | null>;               // 맞힌 것이 없으면 "miss"
    possessNearest(): Promise<string | null>;
    release(): Promise<string | null>;
    escape(): Promise<string | null>;
    advanceClock(ms: number): Promise<string | null>;
  }
  export class MatchView {
    constructor(container: HTMLElement, client: MatchClient, options?: MatchViewOptions);
    start(): Promise<void>;
    onHud(cb: (hud: HudState) => void): () => void;
    debugHandle(): MatchDebugHandle;
    dispose(): void;
  }
  ```

- [ ] **Step 1: 입력·무기 보조 기능**

`src/game/render/FpsInput.ts` — 필드 추가(`private readonly keys` 아래):
```ts
  private readonly pressed = new Set<string>();
```
메서드 추가(`consumeLook` 아래):
```ts
  consumePress(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }
```
`onKeyDown` 교체:
```ts
  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (!e.repeat) this.pressed.add(e.code);
  };
```
`onBlur` 교체:
```ts
  private onBlur = () => {
    this.keys.clear();
    this.pressed.clear();
    this.firing = false;
  };
```

`src/game/render/Viewmodel.ts` — 메서드 추가(`fire` 위):
```ts
  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }
```

- [ ] **Step 2: 스킨 모델 도우미** — `src/game/render/skinned.ts`

```ts
import * as THREE from "three";

// A fresh SkeletonUtils clone has stale bone matrices until its first render,
// so its skinned bounds are wrong unless the skeletons are updated first.
export function skinnedHeight(object: THREE.Object3D): number {
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.skeleton.update();
    mesh.computeBoundingBox();
  });
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).y;
}

// Own material copies so one actor's hit flash does not light up the others.
export function ownMaterials(object: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.clone());
    mesh.material = Array.isArray(mesh.material) ? own : own[0];
    for (const m of own) if (m instanceof THREE.MeshStandardMaterial) materials.push(m);
  });
  return materials;
}

export function clipByName(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const clip = THREE.AnimationClip.findByName(clips, name);
  if (!clip) throw new Error(`animation clip missing: ${name} (has ${clips.map((c) => c.name).join(", ")})`);
  return clip;
}

export class ActionBlender {
  private current: THREE.AnimationAction;

  constructor(first: THREE.AnimationAction) {
    this.current = first.play();
  }

  fadeTo(next: THREE.AnimationAction, seconds = 0.15): void {
    if (next === this.current) return;
    next.reset().play().crossFadeFrom(this.current, seconds, false);
    this.current = next;
  }
}
```

- [ ] **Step 3: 몬스터·다른 플레이어 모습**

`src/game/render/MonsterActor.ts`:
```ts
import * as THREE from "three";
import type { MonsterState } from "../match/types";
import { ActionBlender, clipByName, ownMaterials, skinnedHeight } from "./skinned";

const MONSTER_HEIGHT = 1.8;
const HIT_FLASH_SECONDS = 0.08;
const FOLLOW_RATE = 12;

export class MonsterActor {
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly death: THREE.AnimationAction;
  private readonly blender: ActionBlender;
  private readonly materials: THREE.MeshStandardMaterial[];
  private flashLeft = 0;
  private lastHp: number | null = null;
  private dead = false;
  private placed = false;

  constructor(readonly id: string, readonly object: THREE.Object3D, clips: THREE.AnimationClip[]) {
    object.scale.setScalar(MONSTER_HEIGHT / skinnedHeight(object));
    this.materials = ownMaterials(object);
    this.mixer = new THREE.AnimationMixer(object);
    this.idle = this.mixer.clipAction(clipByName(clips, "Z_Idle"));
    this.walk = this.mixer.clipAction(clipByName(clips, "Z_Walk_InPlace"));
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
    if (!state.alive && !this.dead) {
      this.dead = true;
      this.blender.fadeTo(this.death, 0.1);
    } else if (!this.dead) {
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

`src/game/render/RemotePlayerActor.ts`:
```ts
import * as THREE from "three";
import type { Pose } from "../match/types";
import { ActionBlender, clipByName, skinnedHeight } from "./skinned";

const PLAYER_HEIGHT = 1.8;
const FOLLOW_RATE = 12;

export type PlayerStatus = "active" | "dead" | "escaped";

export class RemotePlayerActor {
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly run: THREE.AnimationAction;
  private readonly death: THREE.AnimationAction;
  private readonly blender: ActionBlender;
  private placed = false;
  private dead = false;

  constructor(readonly account: string, readonly object: THREE.Object3D, clips: THREE.AnimationClip[]) {
    object.scale.setScalar(PLAYER_HEIGHT / skinnedHeight(object));
    object.traverse((o) => {
      o.frustumCulled = false;
    });
    this.mixer = new THREE.AnimationMixer(object);
    this.idle = this.mixer.clipAction(clipByName(clips, "Idle_Rifle"));
    this.run = this.mixer.clipAction(clipByName(clips, "Run_Rifle"));
    this.death = this.mixer.clipAction(clipByName(clips, "Death_Rifle"));
    this.death.setLoop(THREE.LoopOnce, 1);
    this.death.clampWhenFinished = true;
    this.blender = new ActionBlender(this.idle);
    object.visible = false;
  }

  sync(pose: Pose | null, status: PlayerStatus, dt: number): void {
    if (!pose || status === "escaped") {
      this.object.visible = false;
      return;
    }
    const p = this.object.position;
    if (!this.placed) {
      p.set(pose.x, 0, pose.z);
      this.placed = true;
    }
    const k = 1 - Math.exp(-dt * FOLLOW_RATE);
    const dx = pose.x - p.x;
    const dz = pose.z - p.z;
    p.x += dx * k;
    p.z += dz * k;
    this.object.rotation.y = pose.yaw + Math.PI;
    if (status === "dead" && !this.dead) {
      this.dead = true;
      this.blender.fadeTo(this.death, 0.1);
    } else if (!this.dead) {
      this.blender.fadeTo(Math.hypot(dx, dz) > 0.03 ? this.run : this.idle);
    }
    this.object.visible = true;
    this.mixer.update(dt);
  }
}
```

- [ ] **Step 4: 비명 합성음** — `src/game/render/scream.ts`

```ts
let audio: AudioContext | null = null;

// A short filtered noise burst. Placeholder until real sound effects arrive.
export function playScream(): void {
  if (typeof AudioContext === "undefined") return;
  audio ??= new AudioContext();
  const ctx = audio;
  const duration = 0.6;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 6;
  const t = ctx.currentTime;
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
  filter.frequency.exponentialRampToValueAtTime(500, t + duration);
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}
```

- [ ] **Step 5: 매치 화면** — `src/game/render/MatchView.ts`

```ts
import * as THREE from "three";
import type { ClientPhase, ClientState, MatchClient } from "../../net/matchClient";
import { ModelLibrary } from "../assets/ModelLibrary";
import {
  AKM_FIRE_INTERVAL_MS, AKM_RANGE, EXIT_RADIUS, POSSESS_RANGE, RANGE_SLACK, ZOMBIE_ATTACK_RANGE,
} from "../match/constants";
import { isActive } from "../match/lifecycle";
import { ZOMBIE_SPEED } from "../match/monsterAi";
import type { MatchResult, PlayerResult, Pose, Possession, PublicMatch } from "../match/types";
import { distance } from "../match/view";
import { ZOMBIE_HEIGHT, ZOMBIE_RADIUS, resolveShot, type HitTarget, type Ray3 } from "../rules/combat";
import { LEVEL_1, TILE_SIZE, parseLevel, solidAt, spawnPoint, type LevelLayout } from "../rules/levelLayout";
import { EYE_HEIGHT, PLAYER_RADIUS, applyLook, stepPlayer } from "../rules/movement";
import { FpsInput } from "./FpsInput";
import { MonsterActor } from "./MonsterActor";
import { RemotePlayerActor, type PlayerStatus } from "./RemotePlayerActor";
import { Viewmodel } from "./Viewmodel";
import { playScream } from "./scream";

export const LOOK_SENSITIVITY = 0.0022;

// Corrections for the Decrepit Dungeon kit's own pivots and facing, tuned by eye in Plan 1.
// Wall_A is authored running along z, so it needs a quarter turn to span its edge.
export const KIT = { wallYawOffset: Math.PI / 2, wallInset: 0, ceilingYOffset: 0 };

const KIT_MODELS = ["dd_floor_a", "dd_ceiling", "dd_wall_a", "dd_pillar_a", "dd_torch", "dd_barrel", "chest_closed"];
export const MATCH_MODELS = [...KIT_MODELS, "wpn_akm", "zombie1", "contract_killer"];

const MONSTER_EYE = 1.5;
const POSSESSED_SPEED = ZOMBIE_SPEED * 1.3;
const HUD_INTERVAL_MS = 100;
const PLAYER_HEIGHT = 1.8;

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
  fire(): Promise<string | null>;
  possessNearest(): Promise<string | null>;
  release(): Promise<string | null>;
  escape(): Promise<string | null>;
  advanceClock(ms: number): Promise<string | null>;
}

export class MatchView {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  private readonly clock = new THREE.Clock();
  private readonly layout: LevelLayout = parseLevel(LEVEL_1, TILE_SIZE);
  private readonly input: FpsInput;
  private readonly resizeObserver: ResizeObserver;
  private readonly torches: THREE.PointLight[] = [];
  private readonly monsters = new Map<string, MonsterActor>();
  private readonly players = new Map<string, RemotePlayerActor>();
  private readonly hudListeners = new Set<(hud: HudState) => void>();
  private readonly aim = new THREE.Vector3();
  private readonly isSolid = (x: number, z: number) => solidAt(this.layout, x, z);
  private library: ModelLibrary | null = null;
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
      escape: () => this.client.escape(),
      advanceClock: (ms) => this.client.advanceClock(ms),
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

    if (match && !this.spawned && match.players.includes(me)) {
      const spot = spawnPoint(this.layout, match.players.indexOf(me));
      this.pose = { x: spot.x, z: spot.z, yaw: 0 };
      this.spawned = true;
    }

    const look = this.input.consumeLook();
    const view = applyLook(this.yaw, this.pitch, look.dx, look.dy, LOOK_SENSITIVITY);
    this.yaw = view.yaw;
    this.pitch = view.pitch;

    const possession = state.you.possession;
    const active = !!match && match.phase === "playing" && isActive(match, me);
    const move = this.input.moveInput();
    if (active && possession && match) {
      this.driveMonster(match, possession.monsterId, move, dt);
    } else if (active) {
      this.pose = stepPlayer({ ...this.pose, yaw: this.yaw }, move, dt, this.isSolid);
    }
    if (match) this.handleActions(match, state, possession, active);
    if (active && !possession) this.client.reportPose(this.pose);
    this.options.onFrame?.(dt, active ? this.pose : null);
    this.client.tick();

    if (match) {
      this.syncActors(match, state, dt, possession);
      this.placeCamera(match, possession);
    }
    const moving = move.forward !== 0 || move.strafe !== 0;
    this.viewmodel?.setVisible(active && !possession);
    this.viewmodel?.update(dt, moving);

    const t = this.clock.elapsedTime;
    this.torches.forEach((light, i) => {
      light.intensity = 25 + Math.sin(t * 9 + i * 1.7) * 3 + Math.sin(t * 23 + i) * 2;
    });

    this.emitHud(match, state, possession, active);
    this.renderer.render(this.scene, this.camera);
  };

  private handleActions(match: PublicMatch, state: ClientState, possession: Possession | null, active: boolean): void {
    const pressPossess = this.input.consumePress("KeyE");
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

    if (!this.pendingAction && pressPossess && state.you.role === "traitor") {
      const id = this.possessCandidate(match);
      if (id) this.perform(() => this.client.possess(id));
      else this.fail("no_monster");
    }
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
    const me = this.client.account;
    const targets: HitTarget[] = [];
    for (const [id, m] of Object.entries(match.monsters)) {
      if (m.alive) targets.push({ id: `m:${id}`, x: m.x, z: m.z, radius: ZOMBIE_RADIUS, height: ZOMBIE_HEIGHT, alive: true });
    }
    for (const account of match.players) {
      const p = this.client.state.poses[account];
      if (account === me || !p || !isActive(match, account)) continue;
      targets.push({ id: `p:${account}`, x: p.x, z: p.z, radius: PLAYER_RADIUS, height: PLAYER_HEIGHT, alive: true });
    }
    const hit = resolveShot(ray, targets, this.isSolid, AKM_RANGE, TILE_SIZE);
    if (!hit) return Promise.resolve("miss");
    const id = hit.id.slice(2);
    const call = hit.id.startsWith("m:") ? this.client.fireAtMonster(id) : this.client.fireAtPlayer(id);
    return call.then((code) => {
      if (code) this.fail(code);
      return code;
    });
  }

  private driveMonster(
    match: PublicMatch, monsterId: string, move: { forward: number; strafe: number }, dt: number,
  ): void {
    const monster = match.monsters[monsterId];
    if (!monster || !monster.alive) return;
    const next = stepPlayer({ x: monster.x, z: monster.z, yaw: this.yaw }, move, dt, this.isSolid, POSSESSED_SPEED);
    if (next.x === monster.x && next.z === monster.z && Math.abs(this.yaw - monster.yaw) < 1e-3) return;
    this.client.reportMonsters([{ id: monsterId, x: next.x, z: next.z, yaw: this.yaw }]);
  }

  private possessCandidate(match: PublicMatch): string | null {
    let best: { id: string; d: number } | null = null;
    for (const [id, m] of Object.entries(match.monsters)) {
      if (!m.alive || m.possessed) continue;
      const d = distance(this.pose, m);
      if (d <= POSSESS_RANGE && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  }

  private attackCandidate(match: PublicMatch, monsterId: string): string | null {
    const monster = match.monsters[monsterId];
    if (!monster) return null;
    const me = this.client.account;
    let best: { account: string; d: number } | null = null;
    for (const account of match.players) {
      const p = this.client.state.poses[account];
      if (account === me || !p || !isActive(match, account)) continue;
      const d = distance(p, monster);
      if (d <= ZOMBIE_ATTACK_RANGE + RANGE_SLACK && (!best || d < best.d)) best = { account, d };
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

  private syncActors(match: PublicMatch, state: ClientState, dt: number, possession: Possession | null): void {
    const library = this.library;
    if (!library) return;
    for (const [id, m] of Object.entries(match.monsters)) {
      let actor = this.monsters.get(id);
      if (!actor) {
        actor = new MonsterActor(id, library.instance("zombie1"), library.get("zombie1").animations);
        this.scene.add(actor.object);
        this.monsters.set(id, actor);
      }
      actor.sync(m, dt, possession?.monsterId === id);
    }

    const me = this.client.account;
    for (const account of match.players) {
      let actor = this.players.get(account);
      if (!actor) {
        actor = new RemotePlayerActor(account, library.instance("contract_killer"), library.get("contract_killer").animations);
        this.scene.add(actor.object);
        this.players.set(account, actor);
      }
      const status: PlayerStatus = match.dead.includes(account) ? "dead" : match.escaped.includes(account) ? "escaped" : "active";
      // My own body is only drawn while I look out through a monster.
      const pose = account === me ? (possession ? this.pose : null) : (state.poses[account] ?? null);
      actor.sync(pose, status, dt);
    }
  }

  private placeCamera(match: PublicMatch, possession: Possession | null): void {
    const monster = possession ? match.monsters[possession.monsterId] : undefined;
    if (monster) this.camera.position.set(monster.x, MONSTER_EYE, monster.z);
    else this.camera.position.set(this.pose.x, EYE_HEIGHT, this.pose.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  private emitHud(match: PublicMatch | null, state: ClientState, possession: Possession | null, active: boolean): void {
    const now = performance.now();
    if (now - this.lastHudAt < HUD_INTERVAL_MS) return;
    this.lastHudAt = now;
    const me = this.client.account;
    const serverNow = this.client.serverNow();
    const readyAt = state.you.possessReadyAt;
    const possessReadyInMs = readyAt === null ? null : Math.max(0, readyAt - serverNow);
    const exit = this.layout.exits[0];
    const hud: HudState = {
      phase: state.phase,
      role: state.you.role,
      hp: state.you.hp,
      timeLeftMs: match && match.phase === "playing" && match.endsAt !== null ? Math.max(0, match.endsAt - serverNow) : null,
      alive: match ? !match.dead.includes(me) : true,
      escaped: match ? match.escaped.includes(me) : false,
      possession: possession ? { monsterId: possession.monsterId, remainingMs: Math.max(0, possession.endsAt - serverNow) } : null,
      possessReadyInMs,
      canPossess: !!match && active && !possession && state.you.role === "traitor" && possessReadyInMs === 0 && this.possessCandidate(match) !== null,
      nearExit: active && !possession && !!exit && distance(this.pose, exit) <= EXIT_RADIUS,
      players: match?.players.length ?? 0,
      painAt: this.painAt,
      error: this.error,
      result: match?.result ?? null,
      results: match?.results ?? null,
    };
    this.lastHud = hud;
    for (const listener of this.hudListeners) listener(hud);
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

- [ ] **Step 6: 옛 화면 삭제와 임시 App**

```bash
git rm src/game/render/GameView.ts src/game/render/ZombieActor.ts
```

`src/App.tsx`를 임시로 교체(작업 8에서 다시 바꿈):
```tsx
export default function App() {
  return <div className="app" />;
}
```

- [ ] **Step 7: 확인**

Run: `npm run typecheck && npm test && npm run build`
Expected: 타입 에러 없음, 전체 137 PASS, 빌드 성공.

- [ ] **Step 8: 커밋**

```bash
git add -A src/game/render src/App.tsx
git commit -m "feat: multiplayer match view with remote players, monsters and possession control"
```

---

### Task 8: 타이틀·HUD·결과 화면과 앱 흐름, 브라우저 확인

**Files:**
- Create: `src/ui/Hud.tsx`, `src/ui/TitleScreen.tsx`, `src/ui/MatchScreen.tsx`
- Modify: `src/App.tsx` (전체 교체), `src/index.css`

**Interfaces:**
- Consumes: `MatchView`, `HudState` (Task 7), `PracticeSession` (Task 6), `HostDirector`, `MatchClient`, `Verse8Transport`, `useGameServer` (`@agent8/gameserver`)
- Produces: 화면 흐름 — 타이틀 → (연습 | 온라인) → 대기 → 경기(HUD) → 결과 → 타이틀
- 규칙
  - 온라인 버튼은 `VITE_AGENT8_VERSE` 환경값이 있을 때만 켠다(작업 9).
  - `useGameServer()`는 온라인 화면 안에서만 부른다(부르는 순간 Verse8에 접속하기 때문).
  - React StrictMode는 effect를 두 번 실행하므로, 연습 세션·온라인 클라이언트는 effect 안에서 만들고 정리한다.
  - 결과가 나오면 마우스 잠금을 풀어 버튼을 누를 수 있게 한다.

- [ ] **Step 1: HUD** — `src/ui/Hud.tsx`

```tsx
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
```

- [ ] **Step 2: 타이틀** — `src/ui/TitleScreen.tsx`

```tsx
interface TitleScreenProps {
  onPractice: () => void;
  onOnline: () => void;
  onlineAvailable: boolean;
}

export function TitleScreen({ onPractice, onOnline, onlineAvailable }: TitleScreenProps) {
  return (
    <div className="overlay title">
      <h1>DUNGEON EYE</h1>
      <p>넷 중 한 명은 배신자다. 몬스터에 빙의한 배신자를 찾아내고, 살아서 탈출하라.</p>
      <div className="buttons">
        <button type="button" onClick={onPractice}>연습 (봇 3명)</button>
        <button type="button" onClick={onOnline} disabled={!onlineAvailable}>온라인 매치</button>
      </div>
      {!onlineAvailable && <p className="note">온라인 매치는 Verse8 프로젝트를 연결한 뒤 열립니다.</p>}
    </div>
  );
}
```

- [ ] **Step 3: 경기 화면** — `src/ui/MatchScreen.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import type { Pose } from "../game/match/types";
import { MatchView, type HudState } from "../game/render/MatchView";
import type { MatchClient } from "../net/matchClient";
import { Hud } from "./Hud";

export interface MatchScreenProps {
  client: MatchClient;
  onFrame?: (dt: number, pose: Pose | null) => void;
  onExit: () => void;
}

const REASON_LABEL = {
  escaped: "살아남은 모험가가 모두 탈출했습니다",
  wiped: "모험가가 모두 쓰러졌습니다",
  timeout: "시간이 다 되었습니다",
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
```

- [ ] **Step 4: 앱 흐름** — `src/App.tsx` 전체 교체

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameServer } from "@agent8/gameserver";
import type { Pose } from "./game/match/types";
import { LEVEL_1, TILE_SIZE, parseLevel } from "./game/rules/levelLayout";
import { HostDirector } from "./net/hostDirector";
import { MatchClient } from "./net/matchClient";
import { PracticeSession } from "./net/practice";
import { Verse8Transport } from "./net/verse8Transport";
import { MatchScreen } from "./ui/MatchScreen";
import { TitleScreen } from "./ui/TitleScreen";

type Mode = "title" | "practice" | "online";

const layout = parseLevel(LEVEL_1, TILE_SIZE);
const ONLINE_AVAILABLE = Boolean(import.meta.env.VITE_AGENT8_VERSE);

export default function App() {
  const [mode, setMode] = useState<Mode>("title");
  const toTitle = useCallback(() => setMode("title"), []);
  if (mode === "practice") return <PracticeMatch onExit={toTitle} />;
  if (mode === "online") return <OnlineMatch onExit={toTitle} />;
  return (
    <TitleScreen
      onPractice={() => setMode("practice")}
      onOnline={() => setMode("online")}
      onlineAvailable={ONLINE_AVAILABLE}
    />
  );
}

function PracticeMatch({ onExit }: { onExit: () => void }) {
  const [session, setSession] = useState<PracticeSession | null>(null);

  useEffect(() => {
    const next = new PracticeSession(layout);
    let live = true;
    void next.start().then(() => {
      if (live) setSession(next);
    });
    return () => {
      live = false;
      next.dispose();
    };
  }, []);

  const onFrame = useCallback((dt: number, pose: Pose | null) => session?.update(dt, pose), [session]);
  if (!session) return <div className="overlay">연습 방을 준비하는 중…</div>;
  return <MatchScreen client={session.human} onFrame={onFrame} onExit={onExit} />;
}

function OnlineMatch({ onExit }: { onExit: () => void }) {
  const { server, connected } = useGameServer();
  const [client, setClient] = useState<MatchClient | null>(null);

  useEffect(() => {
    if (!connected) return;
    const next = new MatchClient(new Verse8Transport(server));
    let live = true;
    void next.join().then(() => {
      if (live) setClient(next);
    });
    return () => {
      live = false;
      void next.leave();
      next.dispose();
    };
  }, [connected, server]);

  const director = useMemo(() => (client ? new HostDirector(client, layout) : null), [client]);
  const onFrame = useCallback((dt: number, pose: Pose | null) => director?.update(dt, pose), [director]);
  if (!client) return <div className="overlay">{connected ? "매치를 찾는 중…" : "Verse8 서버에 연결하는 중…"}</div>;
  return <MatchScreen client={client} onFrame={onFrame} onExit={onExit} />;
}
```

- [ ] **Step 5: 스타일** — `src/index.css` 끝에 추가

```css
.overlay.dim { background: rgba(8, 6, 6, 0.72); flex-direction: column; gap: 12px; }
.overlay.title { flex-direction: column; gap: 16px; text-align: center; padding: 16px; }
.overlay.title h1 { letter-spacing: 0.3em; font-weight: 600; margin: 0; }
.overlay .buttons { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.overlay button { font: inherit; padding: 10px 18px; border: 1px solid #6a5f55; background: #1b1714; color: #e8e2d6; cursor: pointer; }
.overlay button:disabled { opacity: 0.4; cursor: default; }
.overlay .note { font-size: 13px; opacity: 0.7; }
.overlay.result h2 { margin: 0; letter-spacing: 0.1em; }
.hud-top { position: absolute; left: 16px; top: 12px; display: flex; gap: 14px; align-items: center; pointer-events: none; }
.role { padding: 2px 8px; border: 1px solid currentColor; }
.role-traitor { color: #ff6b5a; }
.role-adventurer { color: #8fd3ff; }
.timer { font-variant-numeric: tabular-nums; }
.hud-possess { position: absolute; right: 16px; top: 12px; color: #ff6b5a; pointer-events: none; }
.hud-prompt { position: absolute; left: 50%; top: 60%; transform: translateX(-50%); pointer-events: none; }
.hud-error { position: absolute; left: 50%; top: 66%; transform: translateX(-50%); color: #ffb35a; pointer-events: none; }
.pain { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 18%; color: #ff4d3d; font-weight: 600; box-shadow: inset 0 0 160px rgba(200, 0, 0, 0.55); pointer-events: none; }
```

기존 `.hud` 규칙은 더 이상 쓰지 않으므로 지운다.

- [ ] **Step 6: 타입·테스트·빌드**

Run: `npm run typecheck && npm test && npm run build`
Expected: 타입 에러 없음, 137 PASS, 빌드 성공.

- [ ] **Step 7: 브라우저 확인 (연습 모드)**

dev 서버(`preview_start {name: "dungeon-eye-dev"}`)를 띄우고 순서대로 확인한다. 각 단계에서 `read_console_messages {onlyErrors: true}`가 비어 있어야 한다.

1. 타이틀 스크린샷. "연습 (봇 3명)" 버튼과 비활성 "온라인 매치" 버튼이 보인다.
2. `find "연습"`으로 버튼을 찾아 클릭. 몇 초 뒤 `javascript_tool`:
   ```js
   const g = window.__game; const h = g.hud(); const s = g.state();
   JSON.stringify({ phase: h.phase, role: h.role, hp: h.hp, time: h.timeLeftMs, players: s.match.players })
   ```
   Expected: `phase: "playing"`, `role`이 `adventurer` 또는 `traitor`, `hp: 100`, `time`이 8분 이하, 플레이어 4명.
3. 5초 기다린 뒤 스크린샷: 봇(contract_killer 모델)이 움직이고 좀비가 다가온다. 다시 `g.state().poses`에 봇 3명의 위치가 있다.
4. 역할이 **모험가**면:
   ```js
   const g = window.__game; g.setPose({ x: 34, z: 20, yaw: 0, pitch: -0.05 });
   await new Promise((r) => setTimeout(r, 400));
   const shots = []; for (let i = 0; i < 3; i++) { shots.push(await g.fire()); await new Promise((r) => setTimeout(r, 150)); }
   JSON.stringify({ shots, zombie: g.state().match.monsters["zombie-0"] })
   ```
   Expected: `shots`가 `null`(명중) 위주이고 `zombie-0`의 `hp`가 줄거나 `alive: false`(봇이 먼저 잡았으면 `"miss"`/`"monster_dead"`도 허용). 그다음:
   ```js
   const g = window.__game; g.setPose({ x: 38, z: 26, yaw: 0 });
   await new Promise((r) => setTimeout(r, 400));
   JSON.stringify({ code: await g.escape(), hud: g.hud() })
   ```
   Expected: `code: null`, 잠시 뒤 `hud.escaped: true`. 봇이 모두 탈출하거나 쓰러지면 결과 화면이 뜬다(스크린샷).
5. 역할이 **배신자**면:
   ```js
   const g = window.__game; await g.advanceClock(60000); g.setPose({ x: 30, z: 14, yaw: -Math.PI / 2, pitch: 0 });
   await new Promise((r) => setTimeout(r, 400));
   JSON.stringify({ code: await g.possessNearest(), hud: g.hud() })
   ```
   Expected: `code: null`. 잠시 뒤 `hud.possession`이 채워지고, 스크린샷에서 카메라가 좀비 눈높이로 바뀌고 무기가 사라진다. `KeyW`를 1초 누르면(`dispatchEvent` 방식) `g.state().match.monsters`의 빙의 몬스터 위치가 바뀐다. `await g.release()` → `null`, `hud.possession: null`.
   (좀비가 이미 죽었거나 멀리 갔으면 `g.state().match.monsters`에서 살아 있는 몬스터 위치로 `setPose`를 바꿔 다시 시도한다.)
6. 결과를 빨리 보려면 `await window.__game.advanceClock(8 * 60000)` → 몇 초 안에 결과 화면("배신자 승리", "시간이 다 되었습니다"). "처음으로" 클릭 → 타이틀.
7. `g.stats().calls`가 500 미만.

- [ ] **Step 8: 커밋**

```bash
git add src/App.tsx src/ui src/index.css
git commit -m "feat: title, lobby, HUD and result screens with a playable practice mode"
```

---

### Task 9: Verse8 실서버 연결 (사용자와 함께)

코드는 이미 연결 준비가 끝났다(`Verse8Transport`, 온라인 버튼). 실제 연결에는 **이 게임의 Verse8 프로젝트 ID**와 서버 배포가 필요하다. 배포 도구(`@agent8/deploy`)는 `.agent8.lock`(또는 `.env`)의 `VITE_AGENT8_VERSE`를 읽고, `server/dist/server.js`를 올린다. 개발 모드 화면은 `<VERSE>-preview`에, 빌드된 화면은 `<VERSE>`에 접속한다(`@agent8/gameserver` 1.10.2). 주소창에 `?account=이름`을 붙이면 탭마다 다른 플레이어로 접속할 수 있다.

**Files:**
- Create: `docs/verse8-setup.md`
- Modify: `README.md`

- [ ] **Step 1: 사용자에게 요청** (이 단계에서 멈추고 답을 기다린다)

사용자에게 다음을 부탁한다:
1. Verse8에서 이 게임용 새 프로젝트를 만든다.
2. 그 프로젝트의 GitLab 저장소 주소를 알려주거나, 저장소 안의 `.agent8.lock` 내용(`VITE_AGENT8_ACCOUNT`, `VITE_AGENT8_VERSE` 두 줄)을 알려준다.
3. 이 저장소(`dungeon-eye`)의 코드를 그 GitLab에 올린다(사용자가 직접 하겠다고 함). Verse8이 `server/`를 빌드해 배포한다.

- [ ] **Step 2: 프로젝트 ID 넣기**

받은 두 줄을 `dungeon-eye/.agent8.lock`에 그대로 저장한다(파일 머리에 "Auto-generated by Agent8" 주석이 있으면 그대로 둔다). `.env`에도 같은 두 줄을 넣는다(개발 서버가 `VITE_` 값을 읽음). `.env`는 `.gitignore`에 추가하지 않는다 — 공개 정보(프로젝트 ID)뿐이고 Verse8 저장소에도 들어 있다. 비밀 토큰은 절대 넣지 않는다.

- [ ] **Step 3: 연결 확인**

1. `npm run dev`로 띄운 뒤 `http://localhost:5173/?account=test-a` 탭을 연다. 타이틀의 "온라인 매치"가 켜져 있어야 한다.
2. 탭 4개(`test-a`~`test-d`)에서 각각 "온라인 매치"를 누른다. 네 번째 입장 후 모든 탭에 역할·체력·시간 HUD가 뜬다.
3. 한 탭에서 움직이면 다른 탭에 그 플레이어가 움직여 보인다. 좀비가 가장 가까운 플레이어를 쫓는다(첫 번째 탭이 호스트).
4. 실패하면 브라우저 콘솔과 `read_network_requests`로 원인을 적는다: 접속 거부(`-preview` 공간에 서버가 없음), `unknown function`(배포 안 됨), 권한 오류 등. 원인이 배포 쪽이면 사용자에게 알리고 멈춘다.

- [ ] **Step 4: 문서** — `docs/verse8-setup.md`

```markdown
# Verse8 연결 방법

1. Verse8에서 게임 프로젝트를 만든다. 생성된 GitLab 저장소의 `.agent8.lock`에 `VITE_AGENT8_ACCOUNT`, `VITE_AGENT8_VERSE`가 있다.
2. 이 두 줄을 이 저장소의 `.agent8.lock`과 `.env`에 넣는다. (토큰 같은 비밀값은 넣지 않는다.)
3. 코드를 Verse8 GitLab에 올리면 Verse8이 화면과 `server/`를 빌드·배포한다.
4. 개발 중 확인: `npm run dev` 후 `http://localhost:5173/?account=test-a` 처럼 탭마다 다른 `account`로 연다.
   - 개발 서버 화면은 `<VERSE>-preview` 공간에, 빌드된 화면은 `<VERSE>` 공간에 접속한다.
5. 서버만 따로 확인: `npm run server:test`
```

`README.md`의 "## 실행" 섹션 끝에 추가:
```markdown
연습 모드(봇 3명)는 서버 연결 없이 바로 된다. 온라인 매치는 [Verse8 연결 방법](docs/verse8-setup.md)을 따른다.
```

- [ ] **Step 5: 커밋과 푸시**

```bash
git add .agent8.lock .env docs/verse8-setup.md README.md
git commit -m "chore: connect the client to the Verse8 project"
git push origin master
```

---

## 완료 기준 (Plan 3)

- vitest 137 PASS, 서버 테스트 20 PASS, 타입 검사·빌드 통과
- 연습 모드에서 봇 3명과 한 판을 끝까지 할 수 있다(모험가: 사격·탈출, 배신자: 빙의·조종·공격·해제)
- 봇만으로 한 판이 끝까지 돌아가는 자동 테스트가 있다
- Verse8 프로젝트가 준비되면 같은 화면이 실서버로 4인 접속된다(작업 9, 사용자 준비 후)
