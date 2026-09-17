# Traitor Hunt — Plan 1: Foundation (single-player FPS slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 명이 브라우저에서 Decrepit Dungeon 방 하나를 1인칭으로 걸어다니며 AKM으로 좀비를 쏴 죽일 수 있는 로컬 실행 가능한 슬라이스를 만든다. 에셋은 Unity → GLB → 최적화 파이프라인을 거친 실제 파일을 쓴다.

**Architecture:** Vite + React + TypeScript 앱에 Three.js 렌더러를 붙인다. 게임 규칙(맵 배치, 이동·충돌, 사격 판정)은 DOM/Three 의존 없는 순수 TS 모듈로 두고 vitest로 검증한다. 렌더러는 그 결과를 그리기만 한다. 에셋은 Unity 에디터 배치모드 + UnityGLTF로 GLB를 뽑고, `@gltf-transform`으로 압축해 `public/assets/models/`에 둔다.

**Tech Stack:** Node 24, Vite 8, React 18, TypeScript 6, three 0.185, vitest 3, @gltf-transform 4, meshoptimizer 1, Unity 6000.5.2f1 + UnityGLTF (Khronos).

## 전체 로드맵 (이 문서는 Plan 1만 다룬다)

| 계획 | 내용 | 결과물 |
|---|---|---|
| **Plan 1 (이 문서)** | 스캐폴딩, 에셋 파이프라인, 싱글 FPS 이동·사격 | 로컬에서 방 하나 돌아다니며 좀비 사격 |
| Plan 2 | `server.js` 규칙: 룸 입장, 역할 배정(서버 전용), 빙의 게이지/지속/쿨다운, 연결 대미지, 승패 판정 + vm 기반 테스트 하네스 | 서버 규칙 테스트 통과 |
| Plan 3 | 멀티플레이 연결: 위치 동기화(throttle 100ms), 원격 플레이어·몬스터 보간, 빙의 시 카메라/조작 전환, 본체 실신 연출, 근접 비명 연출 | 4인 한 판 플레이 |
| Plan 4 | 매치 흐름 UI(로비·결과창·배신자 공개), 모바일 입력, 로딩 단계화, 성능 예산 검증, 배포 | Verse8 배포 |

Plan 2 이후 문서는 Plan 1의 실제 에셋 내보내기 결과(본 이름, 클립 이름)를 보고 작성한다.

## Global Constraints

- 배포 대상은 Verse8. `vite.config.ts`는 `base: "./"` 필수(서브패스 서빙). 런타임 fetch는 전부 `publicUrl()` 경유.
- `resolve.dedupe: ["react","react-dom"]`, `optimizeDeps.include`에 `@agent8/gameserver` 포함 (dungeon-warden에서 검증된 설정 그대로).
- 원본 에셋은 `art-src/`(gitignore됨). 저장소에 커밋하는 모델은 `public/assets/models/`의 최적화된 GLB만.
- 모든 GLB는 `EXT_meshopt_compression`으로 패킹. 로더는 `MeshoptDecoder` 등록 필수.
- `THREE.Cache.enabled = false` (dungeon-warden에서 켰을 때 텍스처가 비는 문제 확인됨).
- 폴리곤 예산: 데스크탑 화면당 50만~100만 트라이앵글/드로우콜 500 이하, 모바일 5만~10만/100 이하. Plan 1은 데스크탑만 측정.
- 게임 규칙 모듈(`src/game/rules/`)은 `three`, `react`, DOM을 import하지 않는다.
- 테스트는 `tests/**/*.test.ts`, 환경은 node.
- Unity 배치모드 실행 전 해당 프로젝트(`My project`)가 에디터에서 열려 있으면 안 된다(열려 있으면 배치모드가 실패함).
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
traitor-hunt/
  package.json, vite.config.ts, vitest.config.ts, index.html
  tsconfig.json, tsconfig.app.json, tsconfig.node.json
  src/
    main.tsx                      앱 진입점 (GameServerProvider 포함)
    App.tsx                       캔버스 + HUD 셸
    index.css
    game/
      assets/publicUrl.ts         서브패스 대응 URL
      assets/ModelLibrary.ts      manifest 읽고 GLB 로드/복제
      rules/levelLayout.ts        문자 그리드 → 타일 배치 목록
      rules/movement.ts           WASD 입력 → 위치, 벽 충돌
      rules/combat.ts             레이 vs 타겟 판정, HP 감소
      render/GameView.ts          Three 씬 조립, 루프
      render/FpsInput.ts          포인터락, 키 상태
      render/Viewmodel.ts         1인칭 무기 표시
      render/ZombieActor.ts       좀비 모델·애니메이션·피격 연출
  scripts/
    export-glb.mjs                Unity 배치모드 실행 + 결과 검사
    optimize-models.mjs           _glb → public/assets/models, manifest 생성
    lib/manifest.mjs              manifest 생성 순수 함수
  .claude/launch.json             dev 서버 실행 설정 (브라우저 검증용)
  docs/licenses/asset-provenance.md  에셋별 라이선스 기록
  unity/
    ExportGlb.cs                  Unity 에디터 스크립트 원본 (My project로 복사해 사용)
    export-list.json              내보낼 프리팹/FBX 목록
  tests/
    publicUrl.test.ts, manifest.test.ts, levelLayout.test.ts,
    movement.test.ts, combat.test.ts
  public/assets/models/           최적화된 GLB + manifest.json (커밋 대상)
```

---

### Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/game/assets/publicUrl.ts`
- Test: `tests/publicUrl.test.ts`

**Interfaces:**
- Produces: `publicUrl(path: string): string` — `src/game/assets/publicUrl.ts`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "traitor-hunt",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc -b",
    "preview": "vite preview",
    "models": "node scripts/optimize-models.mjs",
    "test": "vitest run"
  },
  "dependencies": {
    "@agent8/gameserver": "^1.10.2",
    "@verse8/platform": "^2.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.185.1"
  },
  "devDependencies": {
    "@gltf-transform/core": "^4.5.0",
    "@gltf-transform/extensions": "^4.5.0",
    "@gltf-transform/functions": "^4.5.0",
    "@types/node": "^24.13.3",
    "@types/react": "^18.3.31",
    "@types/react-dom": "^18.3.7",
    "@types/three": "^0.185.4",
    "@vitejs/plugin-react": "^6.1.0",
    "meshoptimizer": "^1.2.0",
    "sharp": "^0.35.4",
    "typescript": "~6.0.2",
    "vite": "^8.2.2",
    "vitest": "^3.2.7"
  }
}
```

- [ ] **Step 2: 설치**

Run: `npm install`
Expected: 에러 없이 `node_modules` 생성.

- [ ] **Step 3: 설정 파일 작성**

`vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Verse8 serves the game from a sub-path; root-absolute URLs 404 there.
  base: "./",
  // Two React copies (SDK peer dep) cause "Invalid hook call"; pin one.
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: ["@agent8/gameserver", "react", "react-dom", "react/jsx-runtime"],
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    watch: {
      ignored: ["**/.git/**", "**/node_modules/**", "**/public/assets/**", "**/art-src/**", "**/dist/**"],
    },
  },
  build: { outDir: "dist", reportCompressedSize: false, chunkSizeWarningLimit: 5000 },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
```

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "types": ["node", "vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "tests"]
}
```

`index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0b0a09" />
    <title>Traitor Hunt</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: 실패하는 테스트 작성** — `tests/publicUrl.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";

describe("publicUrl", () => {
  it("joins a relative base and a path with exactly one slash", async () => {
    vi.stubEnv("BASE_URL", "./");
    const { publicUrl } = await import("../src/game/assets/publicUrl");
    expect(publicUrl("assets/models/manifest.json")).toBe("./assets/models/manifest.json");
    expect(publicUrl("/assets/a.glb")).toBe("./assets/a.glb");
  });
});
```

- [ ] **Step 5: 실패 확인**

Run: `npx vitest run tests/publicUrl.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/assets/publicUrl"`

- [ ] **Step 6: 구현** — `src/game/assets/publicUrl.ts`

```ts
// Verse8 serves from a sub-path, so hand-built fetch URLs must be base-relative.
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "./";
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}
```

- [ ] **Step 7: 통과 확인**

Run: `npx vitest run tests/publicUrl.test.ts`
Expected: PASS (1 test)

- [ ] **Step 8: 앱 셸 작성**

`src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GameServerProvider } from "@agent8/gameserver";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GameServerProvider>
      <App />
    </GameServerProvider>
  </StrictMode>,
);
```

`src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="app">
      <div className="hud">DUNGEON EYE</div>
    </div>
  );
}
```

`src/index.css`:
```css
html, body, #root { margin: 0; height: 100%; background: #0b0a09; color: #e8e2d6; font-family: system-ui, sans-serif; }
.app { position: relative; width: 100%; height: 100%; overflow: hidden; }
.app canvas { display: block; width: 100%; height: 100%; }
.hud { position: absolute; left: 16px; top: 12px; pointer-events: none; letter-spacing: 0.1em; }
.crosshair { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; background: #e8e2d6; border-radius: 50%; pointer-events: none; }
```

- [ ] **Step 9: 빌드·타입체크 확인**

Run: `npm run typecheck && npm run build`
Expected: 둘 다 에러 없음, `dist/index.html` 생성.

- [ ] **Step 10: 커밋**

```bash
git add package.json package-lock.json vite.config.ts vitest.config.ts index.html tsconfig.json tsconfig.app.json tsconfig.node.json src tests
git commit -m "chore: scaffold Vite React Three project for Verse8"
```

---

### Task 2: Unity → GLB 내보내기 도구

`art-src`의 원본은 Unity 프리팹/머티리얼 형태라 Three.js가 바로 못 읽는다. Unity 에디터(설치됨: `C:/Program Files/Unity/Hub/Editor/6000.5.2f1/Editor/Unity.exe`)를 배치모드로 돌려 UnityGLTF로 GLB를 뽑는다. 작업 대상 Unity 프로젝트는 `C:/Users/anjsh/OneDrive/Desktop/My project` (에셋이 `Assets/Resources/` 아래 임포트돼 있음).

알려진 사실 (사전 조사):
- 좀비 FBX/클립은 **Humanoid** 리그(`animationType: 3`), 클립은 `Assets/Resources/Zombie/Animations/Z_*.anim`.
- Contract Killer는 **Generic** 리그(`animationType: 2`), 클립은 `Assets/Resources/Yurowm/Animations/*.FBX`.
- AKM은 프리팹 없음 — `Assets/Resources/Weapons_ChamferZone/AKM/WPN_AKM.FBX` + `Materials/WPNM_AKM.mat`.

**Files:**
- Create: `unity/export-list.json`
- Create: `unity/ExportGlb.cs`
- Create: `scripts/export-glb.mjs` (배치모드 실행 래퍼)
- Modify (외부 프로젝트): `C:/Users/anjsh/OneDrive/Desktop/My project/Packages/manifest.json`
- 출력: `art-src/_glb/*.glb` (gitignore 범위)

**Interfaces:**
- Produces: `art-src/_glb/<name>.glb` 파일들. 이름은 `export-list.json`의 `name`. Task 3이 이 폴더를 읽는다.

- [ ] **Step 1: UnityGLTF 패키지 추가**

`My project/Packages/manifest.json`의 `dependencies` 맨 앞에 한 줄 추가:
```json
"org.khronos.unitygltf": "https://github.com/KhronosGroup/UnityGLTF.git",
```
Unity 에디터에서 `My project`가 열려 있으면 먼저 닫는다.

- [ ] **Step 2: UnityGLTF 설정 API 이름 확인**

패키지는 첫 배치모드 실행 때 받아지므로, 먼저 빈 실행으로 패키지를 받는다:

Run:
```bash
"/c/Program Files/Unity/Hub/Editor/6000.5.2f1/Editor/Unity.exe" -batchmode -quit -projectPath "/c/Users/anjsh/OneDrive/Desktop/My project" -logFile -
```
Expected: 로그 끝에 `Exiting batchmode successfully`.

그다음 설정 필드 이름을 확인:
```bash
grep -rn "public bool ExportAnimations\|public bool BakeAnimationData\|public ExportContext(\|public GLTFSceneExporter(Transform\[\]\|public void SaveGLB(" "/c/Users/anjsh/OneDrive/Desktop/My project/Library/PackageCache" --include=*.cs | head
```
Expected: 다섯 개 시그니처가 모두 보인다. 이름이 다르면 Step 4 코드의 해당 호출을 실제 이름으로 바꾸고, 바꾼 내용을 커밋 메시지에 적는다. 다섯 개 중 `ExportContext`/`GLTFSceneExporter`/`SaveGLB`가 없으면 멈추고 BLOCKED로 보고한다.

- [ ] **Step 3: 내보낼 목록 작성** — `unity/export-list.json`

`kind`:
- `prefab`: 프리팹을 그대로 내보냄
- `fbx`: FBX 모델을 그대로 내보냄 (`material`이 있으면 모든 렌더러에 그 머티리얼 적용)
- `character`: 프리팹 + `clips`의 애니메이션을 담은 임시 AnimatorController를 붙여 내보냄

```json
{

  "items": [
    { "name": "dd_floor_a", "kind": "prefab", "asset": "Assets/Resources/Decrepit Dungeon LITE/Prefabs/Floors/Floor_A.prefab" },
    { "name": "dd_wall_a", "kind": "prefab", "asset": "Assets/Resources/Decrepit Dungeon LITE/Prefabs/Walls/Wall_A.prefab" },
    { "name": "dd_wall_a_corner", "kind": "prefab", "asset": "Assets/Resources/Decrepit Dungeon LITE/Prefabs/Walls/Wall_A_Corner.prefab" },
    { "name": "dd_ceiling", "kind": "prefab", "asset": "Assets/Resources/Decrepit Dungeon LITE/Prefabs/Walls/Ceiling.prefab" },
    { "name": "dd_pillar_a", "kind": "prefab", "asset": "Assets/Resources/Decrepit Dungeon LITE/Prefabs/Pillars/Pillar_A.prefab" },
    { "name": "dd_torch", "kind": "prefab", "asset": "Assets/Resources/Decrepit Dungeon LITE/Prefabs/Props/Torch.prefab" },
    { "name": "dd_barrel", "kind": "prefab", "asset": "Assets/Resources/Decrepit Dungeon LITE/Prefabs/Props/Barrel.prefab" },
    { "name": "dd_crate_a", "kind": "prefab", "asset": "Assets/Resources/Decrepit Dungeon LITE/Prefabs/Props/Crate_A.prefab" },
    { "name": "chest_closed", "kind": "prefab", "asset": "Assets/Resources/Treasure chest closed/treasure_chest_closed.prefab" },
    { "name": "wpn_akm", "kind": "fbx", "asset": "Assets/Resources/Weapons_ChamferZone/AKM/WPN_AKM.FBX", "material": "Assets/Resources/Weapons_ChamferZone/AKM/Materials/WPNM_AKM.mat" },
    {
      "name": "zombie1", "kind": "character", "asset": "Assets/Resources/Zombie/Prefabs/Zombie1.prefab",
      "clips": [
        "Assets/Resources/Zombie/Animations/Z_Idle.anim",
        "Assets/Resources/Zombie/Animations/Z_Walk_InPlace.anim",
        "Assets/Resources/Zombie/Animations/Z_Attack.anim",
        "Assets/Resources/Zombie/Animations/Z_FallingBack.anim"
      ]
    },
    {
      "name": "contract_killer", "kind": "character", "asset": "Assets/Resources/Yurowm/Characters/Contract Killer/ContractKiller.prefab",
      "clips": [
        "Assets/Resources/Yurowm/Animations/Idle_Rifle.FBX",
        "Assets/Resources/Yurowm/Animations/Run_Rifle.FBX",
        "Assets/Resources/Yurowm/Animations/Walk_Rifle.FBX",
        "Assets/Resources/Yurowm/Animations/Death_Rifle.FBX"
      ]
    }
  ]
}
```

- [ ] **Step 4: 에디터 스크립트 작성** — `unity/ExportGlb.cs`

원본은 이 저장소에 두고, 실행 래퍼(Step 5)가 매번 `My project/Assets/Editor/ExportGlb.cs`로 복사한다. Step 2에서 `BakeAnimationData`가 없었다면 그 한 줄을 지운다(좀비 Humanoid 클립이 안 나오면 Step 7에서 드러난다).

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityGLTF;

public static class ExportGlb
{
    [Serializable] class Item { public string name; public string kind; public string asset; public string material; public string[] clips; }
    [Serializable] class ExportList { public string outDir; public Item[] items; }

    const string TempDir = "Assets/__export_tmp";

    // Unity.exe -batchmode -quit -projectPath <p> -executeMethod ExportGlb.Run -exportList <json>
    public static void Run()
    {
        var args = Environment.GetCommandLineArgs();
        var at = Array.IndexOf(args, "-exportList");
        if (at < 0 || at + 1 >= args.Length) throw new ArgumentException("-exportList <path> is required");
        var list = JsonUtility.FromJson<ExportList>(File.ReadAllText(args[at + 1]));
        var outDir = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), list.outDir));
        Directory.CreateDirectory(outDir);
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);

        var failures = new List<string>();
        foreach (var item in list.items)
        {
            try { ExportOne(item, outDir); Debug.Log("[ExportGlb] OK " + item.name); }
            catch (Exception e) { failures.Add(item.name); Debug.LogError("[ExportGlb] FAIL " + item.name + ": " + e); }
        }
        if (failures.Count > 0) EditorApplication.Exit(1);
    }

    static void ExportOne(Item item, string outDir)
    {
        var source = AssetDatabase.LoadAssetAtPath<GameObject>(item.asset);
        if (source == null) throw new FileNotFoundException(item.asset);
        var instance = (GameObject)PrefabUtility.InstantiatePrefab(source);
        try
        {
            instance.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
            if (!string.IsNullOrEmpty(item.material)) ApplyMaterial(instance, item.material);
            if (item.kind == "character") AttachClips(instance, item.clips);

            var settings = GLTFSettings.GetOrCreateSettings();
            settings.ExportAnimations = item.kind == "character";
            settings.BakeAnimationData = true;
            var exporter = new GLTFSceneExporter(new[] { instance.transform }, new ExportContext(settings));
            exporter.SaveGLB(outDir, item.name);
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(instance);
            if (AssetDatabase.IsValidFolder(TempDir)) AssetDatabase.DeleteAsset(TempDir);
        }
    }

    static void ApplyMaterial(GameObject instance, string path)
    {
        var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (mat == null) throw new FileNotFoundException(path);
        foreach (var r in instance.GetComponentsInChildren<Renderer>())
            r.sharedMaterials = Enumerable.Repeat(mat, r.sharedMaterials.Length).ToArray();
    }

    static void AttachClips(GameObject instance, string[] clipPaths)
    {
        AssetDatabase.CreateFolder("Assets", "__export_tmp");
        var controller = AnimatorController.CreateAnimatorControllerAtPath(TempDir + "/tmp.controller");
        var machine = controller.layers[0].stateMachine;
        foreach (var path in clipPaths)
        {
            // FBX takes are often all named "Take 001"; a renamed copy keeps glTF animation names unique.
            var name = Path.GetFileNameWithoutExtension(path);
            var copy = UnityEngine.Object.Instantiate(LoadClip(path));
            copy.name = name;
            AssetDatabase.CreateAsset(copy, TempDir + "/" + name + ".anim");
            machine.AddState(name).motion = copy;
        }
        var animator = instance.GetComponent<Animator>();
        if (animator == null) animator = instance.AddComponent<Animator>();
        animator.runtimeAnimatorController = controller;
    }

    static AnimationClip LoadClip(string path)
    {
        var clip = AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>()
            .FirstOrDefault(c => !c.name.StartsWith("__preview__"));
        if (clip == null) throw new FileNotFoundException("no AnimationClip in " + path);
        return clip;
    }
}
```

- [ ] **Step 5: 실행 래퍼 작성** — `scripts/export-glb.mjs`

에디터 스크립트를 복사하고, Unity를 돌리고, 결과 GLB 존재와 캐릭터 클립 수를 검사한다.

```js
/**
 * Exports the models listed in unity/export-list.json to art-src/_glb.
 *
 *   node scripts/export-glb.mjs
 *
 * Close "My project" in the Unity Editor first: batchmode refuses a project
 * that is already open.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const unityExe = process.env.UNITY_EXE ?? "C:/Program Files/Unity/Hub/Editor/6000.5.2f1/Editor/Unity.exe";
const project = process.env.UNITY_PROJECT ?? resolve(root, "../My project");
const listPath = join(root, "unity/export-list.json");
const list = JSON.parse(readFileSync(listPath, "utf8"));
const outDir = resolve(project, list.outDir);

mkdirSync(join(project, "Assets/Editor"), { recursive: true });
copyFileSync(join(root, "unity/ExportGlb.cs"), join(project, "Assets/Editor/ExportGlb.cs"));

const run = spawnSync(
  unityExe,
  ["-batchmode", "-quit", "-projectPath", project, "-executeMethod", "ExportGlb.Run", "-exportList", listPath, "-logFile", "-"],
  { stdio: "inherit" },
);
if (run.status !== 0) throw new Error(`Unity exited with ${run.status}`);

const io = new NodeIO();
const problems = [];
for (const item of list.items) {
  const file = join(outDir, `${item.name}.glb`);
  if (!existsSync(file)) { problems.push(`${item.name}: missing`); continue; }
  if (item.kind !== "character") continue;
  const doc = await io.read(file);
  const names = doc.getRoot().listAnimations().map((a) => a.getName());
  const expected = item.clips.map((c) => c.split("/").pop().replace(/\.[^.]+$/, ""));
  const lost = expected.filter((n) => !names.includes(n));
  if (lost.length) problems.push(`${item.name}: missing clips ${lost.join(", ")} (has ${names.join(", ") || "none"})`);
}
if (problems.length) throw new Error("export incomplete:\n" + problems.join("\n"));
console.log(`exported ${list.items.length} models to ${outDir}`);
```

`package.json` `scripts`에 추가: `"export-glb": "node scripts/export-glb.mjs"`

- [ ] **Step 6: 실행**

Unity 에디터에서 `My project`를 닫은 상태로:

Run: `npm run export-glb`
Expected: 마지막 줄 `exported 12 models to <저장소 폴더>\art-src\_glb`

- [ ] **Step 7: 실패 시 판단**

- 컴파일 에러(`GLTFSettings` 필드 없음 등): Step 2 결과대로 이름 수정 후 재실행.
- `zombie1: missing clips ...`: Humanoid 클립이 안 구워진 것. `BakeAnimationData` 이름을 Step 2 grep으로 다시 확인. 그래도 안 되면 멈추고 BLOCKED 보고 — 로그의 `[ExportGlb]` 줄과 `has ...` 목록을 그대로 첨부.
- 그 외 개별 `FAIL`: 해당 줄 에러 메시지로 원인 수정(경로 오타가 가장 흔함).

- [ ] **Step 8: 커밋**

```bash
git add unity scripts/export-glb.mjs package.json
git commit -m "feat: export Unity asset prefabs to GLB in batchmode"
```
(`My project` 쪽 변경과 `art-src/_glb`는 이 저장소에 커밋하지 않는다.)

---

### Task 3: 모델 최적화 + manifest

**Files:**
- Create: `scripts/lib/manifest.mjs`
- Create: `scripts/optimize-models.mjs`
- Test: `tests/manifest.test.ts`
- 출력(커밋 대상): `public/assets/models/*.glb`, `public/assets/models/manifest.json`

**Interfaces:**
- Consumes: `art-src/_glb/<name>.glb` (Task 2)
- Produces: `public/assets/models/manifest.json` 형식
  ```ts
  interface ModelManifest {
    models: Record<string, { url: string; bytes: number; animations: string[] }>;
  }
  ```
  `url`은 `public/` 기준 상대경로(`assets/models/<name>.glb`). Task 6의 `ModelLibrary`가 읽는다.

- [ ] **Step 1: 실패하는 테스트** — `tests/manifest.test.ts`

```ts
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { buildManifest } from "../scripts/lib/manifest.mjs";

describe("buildManifest", () => {
  it("keys models by name with a public-relative url, sorted", () => {
    const manifest = buildManifest([
      { name: "zombie1", bytes: 2048, animations: ["Z_Idle", "Z_Attack"] },
      { name: "dd_floor_a", bytes: 512, animations: [] },
    ]);
    expect(Object.keys(manifest.models)).toEqual(["dd_floor_a", "zombie1"]);
    expect(manifest.models.zombie1).toEqual({
      url: "assets/models/zombie1.glb",
      bytes: 2048,
      animations: ["Z_Idle", "Z_Attack"],
    });
  });

  it("rejects a name that is not a safe file stem", () => {
    expect(() => buildManifest([{ name: "../evil", bytes: 1, animations: [] }])).toThrow(/invalid model name/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/manifest.test.ts`
Expected: FAIL — `Failed to resolve import "../scripts/lib/manifest.mjs"`

- [ ] **Step 3: 구현** — `scripts/lib/manifest.mjs`

```js
const SAFE_NAME = /^[a-z0-9_]+$/;

/** @param {{ name: string, bytes: number, animations: string[] }[]} entries */
export function buildManifest(entries) {
  const models = {};
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!SAFE_NAME.test(entry.name)) throw new Error(`invalid model name: ${entry.name}`);
    models[entry.name] = {
      url: `assets/models/${entry.name}.glb`,
      bytes: entry.bytes,
      animations: entry.animations,
    };
  }
  return { models };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/manifest.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 최적화 스크립트** — `scripts/optimize-models.mjs`

규칙: 스킨 있는 모델(캐릭터)은 quantize까지, 정적 모델은 quantize 안 함(나중에 InstancedMesh로 원본 지오메트리를 쓸 수 있게). 텍스처는 최대 1024px WebP. 전부 meshopt 패킹.

```js
/**
 * art-src/_glb -> public/assets/models (+ manifest.json)
 *
 *   node scripts/optimize-models.mjs
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune, quantize, resample, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { buildManifest } from "./lib/manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "art-src/_glb");
const outDir = join(root, "public/assets/models");
mkdirSync(outDir, { recursive: true });

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const entries = [];
for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".glb"))) {
  const name = basename(file, ".glb");
  const doc = await io.read(join(srcDir, file));
  const skinned = doc.getRoot().listSkins().length > 0;

  const steps = [
    weld(),
    dedup(),
    resample(),
    prune({ keepLeaves: skinned }),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024] }),
  ];
  if (skinned) steps.push(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }));
  await doc.transform(...steps);
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const outFile = join(outDir, file);
  await io.write(outFile, doc);
  const animations = doc.getRoot().listAnimations().map((a) => a.getName());
  entries.push({ name, bytes: statSync(outFile).size, animations });
  console.log(`${name}: ${Math.round(statSync(join(srcDir, file)).size / 1024)} KB -> ${Math.round(statSync(outFile).size / 1024)} KB`);
}

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(buildManifest(entries), null, 2) + "\n");
console.log(`wrote ${entries.length} models`);
```

- [ ] **Step 6: 실행**

Run: `npm run models`
Expected: 모델마다 `이름: A KB -> B KB` 한 줄, 마지막 `wrote 12 models`. `public/assets/models/manifest.json`에 `zombie1.animations`가 `["Z_Idle","Z_Walk_InPlace","Z_Attack","Z_FallingBack"]`(순서 무관)로 들어있는지 확인.

- [ ] **Step 7: 용량 확인**

Run: `du -sh public/assets/models`
Expected: 30MB 이하. 넘으면 가장 큰 파일 이름과 크기를 보고하고, `resize`를 `[512, 512]`로 낮춰 재실행한다.

- [ ] **Step 8: 커밋**

```bash
git add scripts/lib/manifest.mjs scripts/optimize-models.mjs tests/manifest.test.ts public/assets/models
git commit -m "feat: optimize exported GLBs and write model manifest"
```

---

### Task 4: 맵 배치 규칙 (순수 TS)

문자 그리드로 방을 정의하고, 바닥·천장·벽 패널·소품 배치 목록과 충돌용 고체 판정을 만든다. 좌표계: 칸 `(col,row)`의 중심은 `x=(col+0.5)*tileSize`, `z=(row+0.5)*tileSize`, 바닥 높이 `y=0`.

기호: `#` 벽, `.` 바닥, `P` 플레이어 시작(바닥), `Z` 좀비 시작(바닥), `B` 통(바닥+소품), `C` 상자(바닥+소품), `T` 기둥+횃불(고체).

벽 패널은 "바닥 칸과 벽 칸이 맞닿은 변"마다 하나. 위치는 바닥 칸 중심에서 벽 방향으로 `tileSize/2`, `rotationY`는 패널의 +z가 바닥 쪽을 보도록: 바닥의 +z쪽 벽 → `π`, -z쪽 → `0`, +x쪽 → `-π/2`, -x쪽 → `π/2`. (모델 자체의 앞 방향 보정은 렌더러가 Task 7에서 한다.)

**Files:**
- Create: `src/game/rules/levelLayout.ts`
- Test: `tests/levelLayout.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Placement { model: string; x: number; y: number; z: number; rotationY: number }
  export interface Point2 { x: number; z: number }
  export interface LevelLayout {
    tileSize: number; cols: number; rows: number;
    solid: boolean[][];            // [row][col]
    placements: Placement[];
    playerSpawn: Point2;
    zombieSpawns: Point2[];
  }
  export function parseLevel(rows: string[], tileSize: number): LevelLayout
  export function solidAt(layout: LevelLayout, x: number, z: number): boolean
  export const LEVEL_1: string[]
  export const TILE_SIZE: number   // 4
  ```
  모델 이름은 Task 2의 `export-list.json` 이름과 같아야 한다: `dd_floor_a`, `dd_ceiling`, `dd_wall_a`, `dd_pillar_a`, `dd_torch`, `dd_barrel`, `chest_closed`.

- [ ] **Step 1: 실패하는 테스트** — `tests/levelLayout.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { LEVEL_1, parseLevel, solidAt } from "../src/game/rules/levelLayout";

const MAP = [
  "####",
  "#PZ#",
  "#.B#",
  "####",
];

describe("parseLevel", () => {
  const level = parseLevel(MAP, 2);

  it("records size, spawns and solidity", () => {
    expect(level.cols).toBe(4);
    expect(level.rows).toBe(4);
    expect(level.playerSpawn).toEqual({ x: 3, z: 3 });
    expect(level.zombieSpawns).toEqual([{ x: 5, z: 3 }]);
    expect(level.solid[0][0]).toBe(true);
    expect(level.solid[1][1]).toBe(false);
  });

  it("puts a floor and a ceiling on every walkable cell", () => {
    const floors = level.placements.filter((p) => p.model === "dd_floor_a");
    const ceilings = level.placements.filter((p) => p.model === "dd_ceiling");
    expect(floors).toHaveLength(4);
    expect(ceilings).toHaveLength(4);
    expect(ceilings[0].y).toBeGreaterThan(0);
  });

  it("puts one wall panel on each floor/wall edge, facing the floor", () => {
    const walls = level.placements.filter((p) => p.model === "dd_wall_a");
    expect(walls).toHaveLength(8);
    const northOfSpawn = walls.find((w) => w.x === 3 && w.z === 2);
    expect(northOfSpawn?.rotationY).toBe(0);
    const westOfSpawn = walls.find((w) => w.x === 2 && w.z === 3);
    expect(westOfSpawn?.rotationY).toBeCloseTo(Math.PI / 2);
  });

  it("places props on their cells", () => {
    expect(level.placements).toContainEqual({ model: "dd_barrel", x: 5, y: 0, z: 5, rotationY: 0 });
  });

  it("rejects ragged rows and unknown symbols", () => {
    expect(() => parseLevel(["##", "#"], 2)).toThrow(/row 1/);
    expect(() => parseLevel(["#?#"], 2)).toThrow(/unknown symbol "\?"/);
  });
});

describe("solidAt", () => {
  const level = parseLevel(MAP, 2);
  it("maps world coordinates to cells and treats outside as solid", () => {
    expect(solidAt(level, 3, 3)).toBe(false);
    expect(solidAt(level, 1.9, 3)).toBe(true);
    expect(solidAt(level, -0.1, 3)).toBe(true);
    expect(solidAt(level, 3, 100)).toBe(true);
  });
});

describe("LEVEL_1", () => {
  it("parses and has one player spawn and at least one zombie", () => {
    const level = parseLevel(LEVEL_1, 4);
    expect(level.zombieSpawns.length).toBeGreaterThan(0);
    expect(solidAt(level, level.playerSpawn.x, level.playerSpawn.z)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/levelLayout.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/rules/levelLayout"`

- [ ] **Step 3: 구현** — `src/game/rules/levelLayout.ts`

```ts
export interface Placement { model: string; x: number; y: number; z: number; rotationY: number }
export interface Point2 { x: number; z: number }
export interface LevelLayout {
  tileSize: number;
  cols: number;
  rows: number;
  solid: boolean[][];
  placements: Placement[];
  playerSpawn: Point2;
  zombieSpawns: Point2[];
}

export const TILE_SIZE = 4;
const CEILING_HEIGHT_TILES = 1;

export const LEVEL_1: string[] = [
  "###########",
  "#P....#...#",
  "#.B...T...#",
  "#.....#.Z.#",
  "##.####...#",
  "#.....#.C.#",
  "#..Z......#",
  "###########",
];

const PROP: Record<string, string> = { B: "dd_barrel", C: "chest_closed" };
const FLOOR_SYMBOLS = new Set([".", "P", "Z", "B", "C"]);
const SOLID_SYMBOLS = new Set(["#", "T"]);

// Neighbour offset -> rotation that turns a panel's +z toward the floor cell.
const EDGES = [
  { dc: 0, dr: -1, rotationY: 0 },
  { dc: 0, dr: 1, rotationY: Math.PI },
  { dc: -1, dr: 0, rotationY: Math.PI / 2 },
  { dc: 1, dr: 0, rotationY: -Math.PI / 2 },
];

export function parseLevel(rows: string[], tileSize: number): LevelLayout {
  const cols = rows[0]?.length ?? 0;
  rows.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`row ${r} has ${row.length} cells, expected ${cols}`);
    for (const ch of row) {
      if (!FLOOR_SYMBOLS.has(ch) && !SOLID_SYMBOLS.has(ch)) throw new Error(`unknown symbol "${ch}" in row ${r}`);
    }
  });

  const center = (c: number, r: number): Point2 => ({ x: (c + 0.5) * tileSize, z: (r + 0.5) * tileSize });
  const solid = rows.map((row) => [...row].map((ch) => SOLID_SYMBOLS.has(ch)));
  const isSolid = (c: number, r: number) => r < 0 || r >= rows.length || c < 0 || c >= cols || solid[r][c];

  const placements: Placement[] = [];
  const zombieSpawns: Point2[] = [];
  // Asserted so TS keeps the wide type; it is assigned inside the callbacks below.
  let playerSpawn = null as Point2 | null;

  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const { x, z } = center(c, r);
      if (ch === "T") {
        placements.push({ model: "dd_pillar_a", x, y: 0, z, rotationY: 0 });
        placements.push({ model: "dd_torch", x, y: tileSize * 0.5, z, rotationY: 0 });
        return;
      }
      if (ch === "#") return;

      placements.push({ model: "dd_floor_a", x, y: 0, z, rotationY: 0 });
      placements.push({ model: "dd_ceiling", x, y: tileSize * CEILING_HEIGHT_TILES, z, rotationY: 0 });
      for (const edge of EDGES) {
        if (!isSolid(c + edge.dc, r + edge.dr)) continue;
        placements.push({
          model: "dd_wall_a",
          x: x + (edge.dc * tileSize) / 2,
          y: 0,
          z: z + (edge.dr * tileSize) / 2,
          rotationY: edge.rotationY,
        });
      }
      if (PROP[ch]) placements.push({ model: PROP[ch], x, y: 0, z, rotationY: 0 });
      if (ch === "P") playerSpawn = { x, z };
      if (ch === "Z") zombieSpawns.push({ x, z });
    });
  });

  if (!playerSpawn) throw new Error("level has no player spawn (P)");
  return { tileSize, cols, rows: rows.length, solid, placements, playerSpawn, zombieSpawns };
}

export function solidAt(layout: LevelLayout, x: number, z: number): boolean {
  const c = Math.floor(x / layout.tileSize);
  const r = Math.floor(z / layout.tileSize);
  if (r < 0 || r >= layout.rows || c < 0 || c >= layout.cols) return true;
  return layout.solid[r][c];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/levelLayout.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/game/rules/levelLayout.ts tests/levelLayout.test.ts
git commit -m "feat: parse dungeon grid into tile placements and solidity"
```

---

### Task 5: 1인칭 이동·시점 규칙 (순수 TS)

Three.js 카메라 관례를 따른다: `yaw=0`일 때 앞은 `-z`, 오른쪽은 `+x`. 앞 벡터 `(-sin yaw, -cos yaw)`, 오른쪽 벡터 `(cos yaw, -sin yaw)`. 충돌은 반지름 `PLAYER_RADIUS` 사각형의 네 모서리를 고체 판정에 넣어 검사하고, x축과 z축을 따로 처리해 벽을 따라 미끄러지게 한다. 막히면 이동량을 절반씩 줄여 최대 5번 다시 시도해 벽에 붙는다.

**Files:**
- Create: `src/game/rules/movement.ts`
- Test: `tests/movement.test.ts`

**Interfaces:**
- Consumes: 없음 (고체 판정은 함수로 받음 — 실제로는 Task 4의 `solidAt`을 감싸서 넘김)
- Produces:
  ```ts
  export const PLAYER_RADIUS = 0.35;
  export const WALK_SPEED = 4;          // m/s
  export const MAX_STEP_SECONDS = 0.1;
  export const EYE_HEIGHT = 1.6;
  export const PITCH_LIMIT: number;      // Math.PI / 2 - 0.01
  export interface MoveInput { forward: number; strafe: number }   // 각각 -1..1
  export interface PlayerPose { x: number; z: number; yaw: number }
  export type SolidTest = (x: number, z: number) => boolean;
  export function stepPlayer(pose: PlayerPose, input: MoveInput, dt: number, isSolid: SolidTest): PlayerPose
  export function applyLook(yaw: number, pitch: number, dx: number, dy: number, sensitivity: number): { yaw: number; pitch: number }
  ```

- [ ] **Step 1: 실패하는 테스트** — `tests/movement.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { PITCH_LIMIT, PLAYER_RADIUS, WALK_SPEED, applyLook, stepPlayer } from "../src/game/rules/movement";

const open = () => false;
const wallWest = (x: number) => x < 0;

describe("stepPlayer", () => {
  it("walks forward along -z at yaw 0", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 0 }, 0.1, open);
    expect(next.x).toBeCloseTo(10);
    expect(next.z).toBeCloseTo(10 - WALK_SPEED * 0.1);
  });

  it("walks forward along -x at yaw +90deg and strafes right along -z", () => {
    const fwd = stepPlayer({ x: 10, z: 10, yaw: Math.PI / 2 }, { forward: 1, strafe: 0 }, 0.1, open);
    expect(fwd.x).toBeCloseTo(10 - WALK_SPEED * 0.1);
    const right = stepPlayer({ x: 10, z: 10, yaw: Math.PI / 2 }, { forward: 0, strafe: 1 }, 0.1, open);
    expect(right.z).toBeCloseTo(10 - WALK_SPEED * 0.1);
  });

  it("strafes right along +x at yaw 0", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 0, strafe: 1 }, 0.1, open);
    expect(next.x).toBeCloseTo(10 + WALK_SPEED * 0.1);
  });

  it("does not move faster diagonally", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 1 }, 0.1, open);
    expect(Math.hypot(next.x - 10, next.z - 10)).toBeCloseTo(WALK_SPEED * 0.1);
  });

  it("caps a long frame so a hitch cannot tunnel through a wall", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 0 }, 5, open);
    expect(10 - next.z).toBeCloseTo(WALK_SPEED * 0.1);
  });

  it("stops at a wall without entering it", () => {
    const next = stepPlayer({ x: 0.5, z: 10, yaw: Math.PI / 2 }, { forward: 1, strafe: 0 }, 0.1, wallWest);
    expect(next.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(next.x).toBeLessThan(0.5);
  });

  it("slides along a wall", () => {
    const next = stepPlayer({ x: PLAYER_RADIUS, z: 10, yaw: Math.PI / 2 }, { forward: 1, strafe: 1 }, 0.1, wallWest);
    expect(next.x).toBeCloseTo(PLAYER_RADIUS);
    expect(next.z).toBeLessThan(10 - 0.2);
  });

  it("stands still with no input", () => {
    const pose = { x: 1, z: 2, yaw: 3 };
    expect(stepPlayer(pose, { forward: 0, strafe: 0 }, 0.1, open)).toEqual(pose);
  });
});

describe("applyLook", () => {
  it("turns right (yaw decreases) when the mouse moves right", () => {
    expect(applyLook(0, 0, 100, 0, 0.002).yaw).toBeCloseTo(-0.2);
  });

  it("clamps pitch so the camera never flips", () => {
    expect(applyLook(0, 0, 0, -100000, 0.002).pitch).toBeCloseTo(PITCH_LIMIT);
    expect(applyLook(0, 0, 0, 100000, 0.002).pitch).toBeCloseTo(-PITCH_LIMIT);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/movement.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/rules/movement"`

- [ ] **Step 3: 구현** — `src/game/rules/movement.ts`

```ts
export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 4;
export const MAX_STEP_SECONDS = 0.1;
export const EYE_HEIGHT = 1.6;
export const PITCH_LIMIT = Math.PI / 2 - 0.01;

export interface MoveInput { forward: number; strafe: number }
export interface PlayerPose { x: number; z: number; yaw: number }
export type SolidTest = (x: number, z: number) => boolean;

export function stepPlayer(pose: PlayerPose, input: MoveInput, dt: number, isSolid: SolidTest): PlayerPose {
  const step = Math.min(Math.max(dt, 0), MAX_STEP_SECONDS);
  const sin = Math.sin(pose.yaw);
  const cos = Math.cos(pose.yaw);
  let mx = -sin * input.forward + cos * input.strafe;
  let mz = -cos * input.forward - sin * input.strafe;
  const len = Math.hypot(mx, mz);
  if (len === 0 || step === 0) return pose;

  const scale = (WALK_SPEED * step * Math.min(1, len)) / len;
  mx *= scale;
  mz *= scale;

  const x = slide(pose.x, mx, (nx) => blocked(nx, pose.z, isSolid));
  const z = slide(pose.z, mz, (nz) => blocked(x, nz, isSolid));
  return { x, z, yaw: pose.yaw };
}

export function applyLook(yaw: number, pitch: number, dx: number, dy: number, sensitivity: number) {
  const nextPitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch - dy * sensitivity));
  return { yaw: yaw - dx * sensitivity, pitch: nextPitch };
}

function blocked(x: number, z: number, isSolid: SolidTest): boolean {
  const r = PLAYER_RADIUS;
  return isSolid(x - r, z - r) || isSolid(x + r, z - r) || isSolid(x - r, z + r) || isSolid(x + r, z + r);
}

function slide(from: number, delta: number, isBlocked: (to: number) => boolean): number {
  if (delta === 0) return from;
  let d = delta;
  for (let i = 0; i < 5; i++) {
    if (!isBlocked(from + d)) return from + d;
    d /= 2;
  }
  return from;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/movement.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/game/rules/movement.ts tests/movement.test.ts
git commit -m "feat: first-person movement with wall sliding and look clamp"
```

---

### Task 6: 사격 판정 규칙 (순수 TS)

적은 세로 원기둥(`x,z` 중심, 반지름, 높이 0~height)으로 판정한다. 레이 방향은 단위 벡터라 교차 `t`가 곧 거리. 벽·바닥·천장은 레이를 0.05m 간격으로 전진시키며 검사한다. 벽보다 가까운 적만 맞는다.

**Files:**
- Create: `src/game/rules/combat.ts`
- Test: `tests/combat.test.ts`

**Interfaces:**
- Consumes: `SolidTest` 타입 (Task 5 `movement.ts`)
- Produces:
  ```ts
  export const AKM: { damage: 34; fireInterval: 0.1; range: 60 };
  export const ZOMBIE_HP = 100;
  export const ZOMBIE_RADIUS = 0.4;
  export const ZOMBIE_HEIGHT = 1.8;
  export interface Ray3 { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }
  export interface HitTarget { id: string; x: number; z: number; radius: number; height: number; alive: boolean }
  export interface ShotHit { id: string; distance: number }
  export function pickTarget(ray: Ray3, targets: HitTarget[], maxRange: number): ShotHit | null
  export function wallDistance(ray: Ray3, isSolid: SolidTest, maxRange: number, ceilingY: number): number
  export function resolveShot(ray: Ray3, targets: HitTarget[], isSolid: SolidTest, range: number, ceilingY: number): ShotHit | null
  export function applyDamage(hp: number, damage: number): { hp: number; killed: boolean }
  export function canFire(lastShotAt: number, now: number, interval: number): boolean
  ```

- [ ] **Step 1: 실패하는 테스트** — `tests/combat.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  AKM, ZOMBIE_HP, applyDamage, canFire, pickTarget, resolveShot, wallDistance,
  type HitTarget, type Ray3,
} from "../src/game/rules/combat";

const ahead: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 0, dz: -1 };
const zombie = (id: string, z: number, alive = true): HitTarget => ({ id, x: 0, z, radius: 0.4, height: 1.8, alive });
const open = () => false;

describe("pickTarget", () => {
  it("hits the near face of a cylinder straight ahead", () => {
    expect(pickTarget(ahead, [zombie("a", -5)], 60)).toEqual({ id: "a", distance: expect.closeTo(4.6, 5) });
  });

  it("misses when the ray passes over the head", () => {
    const up: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 0.8, dz: -0.6 };
    expect(pickTarget(up, [zombie("a", -5)], 60)).toBeNull();
  });

  it("picks the nearest living target and skips the dead", () => {
    const targets = [zombie("far", -10), zombie("dead", -3, false), zombie("near", -6)];
    expect(pickTarget(ahead, targets, 60)?.id).toBe("near");
  });

  it("ignores targets beyond range", () => {
    expect(pickTarget(ahead, [zombie("a", -5)], 4)).toBeNull();
  });
});

describe("wallDistance / resolveShot", () => {
  const wallAt = (d: number) => (_x: number, z: number) => z < -d;

  it("finds the wall along the ray", () => {
    expect(wallDistance(ahead, wallAt(3), 60, 4)).toBeGreaterThanOrEqual(3);
    expect(wallDistance(ahead, wallAt(3), 60, 4)).toBeLessThan(3.1);
  });

  it("stops at the floor and the ceiling", () => {
    const down: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: -1, dz: 0 };
    expect(wallDistance(down, open, 60, 4)).toBeCloseTo(1.6, 1);
    const upward: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 1, dz: 0 };
    expect(wallDistance(upward, open, 60, 4)).toBeCloseTo(2.4, 1);
  });

  it("a wall in front of the target blocks the shot", () => {
    expect(resolveShot(ahead, [zombie("a", -5)], wallAt(3), AKM.range, 4)).toBeNull();
  });

  it("a wall behind the target does not", () => {
    expect(resolveShot(ahead, [zombie("a", -5)], wallAt(8), AKM.range, 4)?.id).toBe("a");
  });
});

describe("damage and fire rate", () => {
  it("kills a zombie in three AKM hits and never goes below zero", () => {
    let hp = ZOMBIE_HP;
    const results = [1, 2, 3].map(() => {
      const r = applyDamage(hp, AKM.damage);
      hp = r.hp;
      return r;
    });
    expect(results.map((r) => r.killed)).toEqual([false, false, true]);
    expect(hp).toBe(0);
  });

  it("allows a shot only after the fire interval", () => {
    expect(canFire(1.0, 1.05, AKM.fireInterval)).toBe(false);
    expect(canFire(1.0, 1.1, AKM.fireInterval)).toBe(true);
    expect(canFire(-Infinity, 0, AKM.fireInterval)).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/combat.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/rules/combat"`

- [ ] **Step 3: 구현** — `src/game/rules/combat.ts`

```ts
import type { SolidTest } from "./movement";

export const AKM = { damage: 34, fireInterval: 0.1, range: 60 } as const;
export const ZOMBIE_HP = 100;
export const ZOMBIE_RADIUS = 0.4;
export const ZOMBIE_HEIGHT = 1.8;

const MARCH_STEP = 0.05;
const EPSILON = 1e-9;

export interface Ray3 { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }
export interface HitTarget { id: string; x: number; z: number; radius: number; height: number; alive: boolean }
export interface ShotHit { id: string; distance: number }

export function pickTarget(ray: Ray3, targets: HitTarget[], maxRange: number): ShotHit | null {
  let best: ShotHit | null = null;
  for (const target of targets) {
    if (!target.alive) continue;
    const t = cylinderHit(ray, target);
    if (t === null || t > maxRange) continue;
    if (!best || t < best.distance) best = { id: target.id, distance: t };
  }
  return best;
}

export function wallDistance(ray: Ray3, isSolid: SolidTest, maxRange: number, ceilingY: number): number {
  const steps = Math.ceil(maxRange / MARCH_STEP);
  for (let i = 1; i <= steps; i++) {
    const t = i * MARCH_STEP;
    const y = ray.oy + ray.dy * t;
    if (y <= 0 || y >= ceilingY || isSolid(ray.ox + ray.dx * t, ray.oz + ray.dz * t)) return t;
  }
  return maxRange;
}

export function resolveShot(
  ray: Ray3, targets: HitTarget[], isSolid: SolidTest, range: number, ceilingY: number,
): ShotHit | null {
  const hit = pickTarget(ray, targets, range);
  if (!hit) return null;
  return hit.distance < wallDistance(ray, isSolid, range, ceilingY) ? hit : null;
}

export function applyDamage(hp: number, damage: number): { hp: number; killed: boolean } {
  const next = Math.max(0, hp - damage);
  return { hp: next, killed: hp > 0 && next === 0 };
}

export function canFire(lastShotAt: number, now: number, interval: number): boolean {
  return now - lastShotAt >= interval - EPSILON;
}

// Nearest t >= 0 where the ray meets the side of an upright cylinder within its height.
function cylinderHit(ray: Ray3, target: HitTarget): number | null {
  const fx = ray.ox - target.x;
  const fz = ray.oz - target.z;
  const a = ray.dx * ray.dx + ray.dz * ray.dz;
  if (a < EPSILON) return null;
  const b = 2 * (fx * ray.dx + fz * ray.dz);
  const c = fx * fx + fz * fz - target.radius * target.radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t < 0) continue;
    const y = ray.oy + ray.dy * t;
    if (y >= 0 && y <= target.height) return t;
  }
  return null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/combat.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 전체 테스트 + 타입체크**

Run: `npm test && npm run typecheck`
Expected: 모든 테스트 PASS, 타입 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/game/rules/combat.ts tests/combat.test.ts
git commit -m "feat: hitscan against upright cylinders with wall occlusion"
```

---

### Task 7: 렌더러 — 던전 방 + 1인칭 이동 + 무기 뷰모델

순수 규칙(Task 4·5)을 Three.js 화면에 붙인다. 이 태스크 끝에 브라우저에서 방을 걸어다니고 손에 AKM이 보여야 한다. 좀비·사격은 Task 8.

Decrepit Dungeon 킷의 실제 치수·피벗·앞 방향은 모른다. 그래서 (1) 바닥 모델의 가로 크기로 킷 전체 배율을 계산하고, (2) 벽 방향/안쪽 보정/천장 높이 보정은 `KIT` 상수 한 곳에 모아 Step 7에서 눈으로 맞춘다.

**Files:**
- Create: `src/game/assets/ModelLibrary.ts`
- Create: `src/game/render/FpsInput.ts`
- Create: `src/game/render/Viewmodel.ts`
- Create: `src/game/render/GameView.ts`
- Modify: `src/App.tsx` (전체 교체)
- Create: `.claude/launch.json`

**Interfaces:**
- Consumes: `publicUrl` (Task 1), manifest 형식 (Task 3), `parseLevel`/`solidAt`/`LEVEL_1`/`TILE_SIZE` (Task 4), `stepPlayer`/`applyLook`/`EYE_HEIGHT`/`MoveInput`/`PlayerPose` (Task 5)
- Produces:
  ```ts
  // ModelLibrary.ts
  export class ModelLibrary {
    static load(): Promise<ModelLibrary>;
    preload(names: string[], onProgress?: (done: number, total: number) => void): Promise<void>;
    get(name: string): { scene: THREE.Group; animations: THREE.AnimationClip[] };
    instance(name: string): THREE.Object3D;   // SkeletonUtils.clone
  }
  // FpsInput.ts
  export class FpsInput {
    constructor(element: HTMLElement);
    readonly locked: boolean;
    firing: boolean;
    moveInput(): MoveInput;
    consumeLook(): { dx: number; dy: number };
    dispose(): void;
  }
  // Viewmodel.ts
  export class Viewmodel {
    constructor(camera: THREE.Camera, weapon: THREE.Object3D);
    fire(): void;
    update(dt: number, moving: boolean): void;
  }
  // GameView.ts
  export class GameView {
    constructor(container: HTMLElement);
    start(options?: { onProgress?: (done: number, total: number) => void }): Promise<void>;
    debugHandle(): GameDebugHandle;
    dispose(): void;
  }
  export interface GameDebugHandle {
    pose(): { x: number; z: number; yaw: number; pitch: number };
    setPose(p: { x: number; z: number; yaw: number; pitch?: number }): void;
    stats(): { triangles: number; calls: number };
  }
  ```
  Task 8이 `GameView`에 좀비·사격을 추가하고 `GameDebugHandle`에 필드를 더한다.

- [ ] **Step 1: 모델 로더** — `src/game/assets/ModelLibrary.ts`

```ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { publicUrl } from "./publicUrl";

// With the cache on, textures in dungeon-warden arrived with no image data.
THREE.Cache.enabled = false;

interface ManifestEntry { url: string; bytes: number; animations: string[] }
interface ModelManifest { models: Record<string, ManifestEntry> }
export interface LoadedModel { scene: THREE.Group; animations: THREE.AnimationClip[] }

export class ModelLibrary {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly loaded = new Map<string, LoadedModel>();

  private constructor(private readonly manifest: ModelManifest) {}

  static async load(): Promise<ModelLibrary> {
    const res = await fetch(publicUrl("assets/models/manifest.json"));
    if (!res.ok) throw new Error(`model manifest: HTTP ${res.status}`);
    return new ModelLibrary((await res.json()) as ModelManifest);
  }

  async preload(names: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    let done = 0;
    onProgress?.(0, names.length);
    await Promise.all(
      names.map(async (name) => {
        if (!this.loaded.has(name)) this.loaded.set(name, await this.fetchModel(name));
        onProgress?.(++done, names.length);
      }),
    );
  }

  get(name: string): LoadedModel {
    const model = this.loaded.get(name);
    if (!model) throw new Error(`model not preloaded: ${name}`);
    return model;
  }

  instance(name: string): THREE.Object3D {
    return cloneSkinned(this.get(name).scene);
  }

  private async fetchModel(name: string): Promise<LoadedModel> {
    const entry = this.manifest.models[name];
    if (!entry) throw new Error(`model not in manifest: ${name}`);
    const gltf = await this.loader.loadAsync(publicUrl(entry.url));
    return { scene: gltf.scene, animations: gltf.animations };
  }
}
```

- [ ] **Step 2: 입력** — `src/game/render/FpsInput.ts`

키보드 이동은 게임 화면이 떠 있으면 항상 받는다(자동 브라우저 검증에서도 이동을 확인할 수 있게). 마우스 시점과 사격은 포인터락 상태에서만.

```ts
import type { MoveInput } from "../rules/movement";

export class FpsInput {
  firing = false;
  private readonly keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;

  constructor(private readonly element: HTMLElement) {
    element.addEventListener("click", this.onClick);
    element.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  moveInput(): MoveInput {
    const k = (code: string) => (this.keys.has(code) ? 1 : 0);
    return { forward: k("KeyW") - k("KeyS"), strafe: k("KeyD") - k("KeyA") };
  }

  consumeLook(): { dx: number; dy: number } {
    const look = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  dispose(): void {
    this.element.removeEventListener("click", this.onClick);
    this.element.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("mousemove", this.onMouseMove);
    if (this.locked) document.exitPointerLock();
  }

  private onClick = () => {
    if (!this.locked) void this.element.requestPointerLock();
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0 && this.locked) this.firing = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false;
  };
  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.firing = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.lookX += e.movementX;
    this.lookY += e.movementY;
  };
}
```

- [ ] **Step 3: 무기 뷰모델** — `src/game/render/Viewmodel.ts`

`WEAPON_ROTATION`은 총구가 화면 안쪽(-z)을 보도록 Step 7에서 맞춘다.

```ts
import * as THREE from "three";

const REST = new THREE.Vector3(0.22, -0.2, -0.45);
export const WEAPON_LENGTH = 0.75;
export const WEAPON_ROTATION = new THREE.Euler(0, Math.PI, 0);

export class Viewmodel {
  private readonly root = new THREE.Group();
  private readonly flash = new THREE.PointLight(0xffb060, 0, 6, 2);
  private kick = 0;
  private flashLeft = 0;
  private bobPhase = 0;

  constructor(camera: THREE.Camera, weapon: THREE.Object3D) {
    const size = new THREE.Box3().setFromObject(weapon).getSize(new THREE.Vector3());
    weapon.scale.setScalar(WEAPON_LENGTH / Math.max(size.x, size.y, size.z));
    weapon.rotation.copy(WEAPON_ROTATION);
    // The weapon hugs the camera; frustum culling only makes it blink.
    weapon.traverse((o) => {
      o.frustumCulled = false;
    });
    this.root.add(weapon);
    this.flash.position.set(0, 0.05, -WEAPON_LENGTH * 0.8);
    this.root.add(this.flash);
    this.root.position.copy(REST);
    camera.add(this.root);
  }

  fire(): void {
    this.kick = 1;
    this.flashLeft = 0.05;
  }

  update(dt: number, moving: boolean): void {
    this.kick = Math.max(0, this.kick - dt * 12);
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    this.flash.intensity = this.flashLeft > 0 ? 8 : 0;
    if (moving) this.bobPhase += dt * 9;
    const bob = moving ? Math.sin(this.bobPhase) * 0.012 : 0;
    this.root.position.set(REST.x, REST.y + bob - this.kick * 0.01, REST.z + this.kick * 0.05);
    this.root.rotation.x = this.kick * 0.06;
  }
}
```

- [ ] **Step 4: 게임 뷰** — `src/game/render/GameView.ts`

조명 방향: 어두운 던전. 약한 환경광 + 기둥 횃불마다 흔들리는 주황 점광원 + 플레이어 시선 방향 스포트라이트. 그림자는 Plan 1에서 끔(성능). 드로우콜은 배치 수만큼 나오므로 `stats()`로 확인하고, 500을 넘으면 Plan 4에서 InstancedMesh로 바꾼다.

```ts
import * as THREE from "three";
import { ModelLibrary } from "../assets/ModelLibrary";
import { LEVEL_1, TILE_SIZE, parseLevel, solidAt, type LevelLayout } from "../rules/levelLayout";
import { EYE_HEIGHT, applyLook, stepPlayer, type PlayerPose } from "../rules/movement";
import { FpsInput } from "./FpsInput";
import { Viewmodel } from "./Viewmodel";

export const LOOK_SENSITIVITY = 0.0022;

// Corrections for the Decrepit Dungeon kit's own pivots and facing, tuned by eye.
export const KIT = { wallYawOffset: 0, wallInset: 0, ceilingYOffset: 0 };

const KIT_MODELS = ["dd_floor_a", "dd_ceiling", "dd_wall_a", "dd_pillar_a", "dd_torch", "dd_barrel", "chest_closed"];
export const LEVEL_MODELS = [...KIT_MODELS, "wpn_akm"];

export interface GameDebugHandle {
  pose(): { x: number; z: number; yaw: number; pitch: number };
  setPose(p: { x: number; z: number; yaw: number; pitch?: number }): void;
  stats(): { triangles: number; calls: number };
}

export class GameView {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  private readonly clock = new THREE.Clock();
  private readonly layout: LevelLayout = parseLevel(LEVEL_1, TILE_SIZE);
  private readonly input: FpsInput;
  private readonly resizeObserver: ResizeObserver;
  private readonly torches: THREE.PointLight[] = [];
  private pose: PlayerPose;
  private pitch = 0;
  private viewmodel: Viewmodel | null = null;
  private frame = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement) {
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

  async start(options: { onProgress?: (done: number, total: number) => void } = {}): Promise<void> {
    const library = await ModelLibrary.load();
    await library.preload(LEVEL_MODELS, options.onProgress);
    // React StrictMode mounts twice; the first view may be gone by now.
    if (this.disposed) return;
    this.buildLevel(library);
    this.addLights();
    this.viewmodel = new Viewmodel(this.camera, library.instance("wpn_akm"));
    this.clock.start();
    this.frame = requestAnimationFrame(this.tick);
  }

  debugHandle(): GameDebugHandle {
    return {
      pose: () => ({ ...this.pose, pitch: this.pitch }),
      setPose: (p) => {
        this.pose = { x: p.x, z: p.z, yaw: p.yaw };
        this.pitch = p.pitch ?? 0;
      },
      stats: () => ({ triangles: this.renderer.info.render.triangles, calls: this.renderer.info.render.calls }),
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
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
        // Panel faces the floor along (sin, cos) of its rotation; inset moves it that way.
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
    this.scene.add(new THREE.AmbientLight(0x6a6070, 0.25));
    for (const p of this.layout.placements) {
      if (p.model !== "dd_torch") continue;
      const light = new THREE.PointLight(0xff8a3d, 25, 12, 2);
      light.position.set(p.x, p.y + 0.4, p.z);
      this.scene.add(light);
      this.torches.push(light);
    }
    const lamp = new THREE.SpotLight(0xfff1dc, 30, 22, 0.55, 0.5, 2);
    lamp.position.set(0, 0, 0);
    lamp.target.position.set(0, 0, -1);
    this.camera.add(lamp, lamp.target);
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);

    const look = this.input.consumeLook();
    const view = applyLook(this.pose.yaw, this.pitch, look.dx, look.dy, LOOK_SENSITIVITY);
    this.pitch = view.pitch;
    const move = this.input.moveInput();
    this.pose = stepPlayer({ ...this.pose, yaw: view.yaw }, move, dt, (x, z) => solidAt(this.layout, x, z));

    this.camera.position.set(this.pose.x, EYE_HEIGHT, this.pose.z);
    this.camera.rotation.set(this.pitch, this.pose.yaw, 0, "YXZ");
    this.viewmodel?.update(dt, move.forward !== 0 || move.strafe !== 0);

    const t = this.clock.elapsedTime;
    this.torches.forEach((light, i) => {
      light.intensity = 25 + Math.sin(t * 9 + i * 1.7) * 3 + Math.sin(t * 23 + i) * 2;
    });

    this.renderer.render(this.scene, this.camera);
  };
}
```

- [ ] **Step 5: 앱 연결** — `src/App.tsx` 전체 교체

```tsx
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
```

`src/index.css` 끝에 추가:
```css
.hint { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); font-size: 13px; opacity: 0.7; pointer-events: none; }
.overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #0b0a09; }
.overlay.error { color: #ff8a7a; }
```

- [ ] **Step 6: 실행 설정** — `.claude/launch.json`

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 7: 브라우저 확인 + 킷 보정**

1. `preview_start {name: "dev"}` 로 띄운다.
2. `read_console_messages {onlyErrors: true}` → 에러 0개. `model not in manifest` 류가 있으면 Task 3 결과와 이름을 맞춘다.
3. `computer {action: "screenshot"}` — 스폰 지점에서 보이는 장면.
4. 보정 판단 (한 번에 하나씩 바꾸고 새로고침 후 스크린샷):
   - 벽이 옆으로 누워 있거나 뒷면(검은/투명)이 보이면 `KIT.wallYawOffset`을 `Math.PI`, `Math.PI/2`, `-Math.PI/2` 순으로 시도.
   - 벽 사이에 틈이 있거나 벽이 바닥 칸 안쪽으로 들어와 있으면 `KIT.wallInset`을 ±0.1 단위로 조정.
   - 천장이 머리에 닿거나 떠 있으면 `KIT.ceilingYOffset` 조정.
   - AKM 총구가 화면 안쪽을 안 보면 `WEAPON_ROTATION`을 `(0, 0, 0)`, `(0, Math.PI/2, 0)`, `(0, -Math.PI/2, 0)` 순으로 시도.
5. 이동 확인 — `javascript_tool`:
   ```js
   const before = window.__game.pose();
   window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
   await new Promise((r) => setTimeout(r, 500));
   window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
   const after = window.__game.pose();
   ({ before, after, stats: window.__game.stats() })
   ```
   Expected: `after.z < before.z` (스폰에서 앞은 -z), `stats.calls < 500`.
6. 벽 충돌 확인 — 같은 방법으로 `KeyA`를 3초 누른다. Expected: `after.x`가 `4 * 1 + 0.35`(= 4.35) 이상 — 왼쪽 벽을 넘지 않음.
7. 최종 스크린샷을 남긴다.

- [ ] **Step 8: 커밋**

```bash
git add src .claude/launch.json
git commit -m "feat: walkable first-person dungeon room with AKM viewmodel"
```

---

### Task 8: 좀비 표적 + 사격

맵의 `Z` 칸에 좀비를 세우고(Plan 1에서는 움직이지 않고 플레이어를 바라보기만 함), 좌클릭 사격으로 Task 6 판정을 거쳐 쓰러뜨린다. 클립 이름은 Task 2에서 정한 파일명 그대로: `Z_Idle`, `Z_FallingBack`.

**Files:**
- Create: `src/game/render/ZombieActor.ts`
- Modify: `src/game/render/GameView.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ModelLibrary` (Task 7), `AKM`/`ZOMBIE_HP`/`ZOMBIE_RADIUS`/`ZOMBIE_HEIGHT`/`resolveShot`/`applyDamage`/`canFire`/`HitTarget`/`Ray3` (Task 6), `Viewmodel.fire()` (Task 7)
- Produces:
  ```ts
  export class ZombieActor {
    constructor(id: string, model: THREE.Object3D, clips: THREE.AnimationClip[], x: number, z: number);
    readonly id: string; readonly object: THREE.Object3D;
    hp: number; readonly alive: boolean;
    target(): HitTarget;
    takeHit(damage: number): boolean;          // true if this hit killed it
    update(dt: number, lookAtX: number, lookAtZ: number): void;
  }
  // GameView additions
  start(options?: { onProgress?; onZombiesChanged?: (remaining: number) => void }): Promise<void>;
  interface GameDebugHandle { ...; fire(): string | null; zombies(): { id: string; hp: number; alive: boolean; x: number; z: number }[] }
  ```

- [ ] **Step 1: 좀비 액터** — `src/game/render/ZombieActor.ts`

```ts
import * as THREE from "three";
import { ZOMBIE_HEIGHT, ZOMBIE_HP, ZOMBIE_RADIUS, applyDamage, type HitTarget } from "../rules/combat";

const IDLE_CLIP = "Z_Idle";
const DEATH_CLIP = "Z_FallingBack";
const HIT_FLASH_SECONDS = 0.08;

export class ZombieActor {
  hp = ZOMBIE_HP;
  private readonly mixer: THREE.AnimationMixer;
  private readonly death: THREE.AnimationAction;
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private flashLeft = 0;

  constructor(
    readonly id: string,
    readonly object: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private readonly x: number,
    private readonly z: number,
  ) {
    const height = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).y;
    object.scale.setScalar(ZOMBIE_HEIGHT / height);
    object.position.set(x, 0, z);

    // Own material copies so one zombie's hit flash does not light up the others.
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.clone());
      mesh.material = Array.isArray(mesh.material) ? own : own[0];
      for (const m of own) if (m instanceof THREE.MeshStandardMaterial) this.materials.push(m);
    });

    this.mixer = new THREE.AnimationMixer(object);
    const clip = (name: string) => {
      const found = THREE.AnimationClip.findByName(clips, name);
      if (!found) throw new Error(`zombie clip missing: ${name} (has ${clips.map((c) => c.name).join(", ")})`);
      return found;
    };
    this.mixer.clipAction(clip(IDLE_CLIP)).play();
    this.death = this.mixer.clipAction(clip(DEATH_CLIP));
    this.death.setLoop(THREE.LoopOnce, 1);
    this.death.clampWhenFinished = true;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  target(): HitTarget {
    return { id: this.id, x: this.x, z: this.z, radius: ZOMBIE_RADIUS, height: ZOMBIE_HEIGHT, alive: this.alive };
  }

  takeHit(damage: number): boolean {
    const result = applyDamage(this.hp, damage);
    this.hp = result.hp;
    this.flashLeft = HIT_FLASH_SECONDS;
    if (result.killed) this.death.reset().fadeIn(0.1).play();
    return result.killed;
  }

  update(dt: number, lookAtX: number, lookAtZ: number): void {
    if (this.alive) this.object.rotation.y = Math.atan2(lookAtX - this.x, lookAtZ - this.z);
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    const glow = this.flashLeft > 0 ? 1.5 : 0;
    for (const m of this.materials) m.emissive.setRGB(glow, glow * 0.2, glow * 0.2);
    this.mixer.update(dt);
  }
}
```

- [ ] **Step 2: GameView에 좀비·사격 추가** — `src/game/render/GameView.ts`

2-1. import 추가:
```ts
import { AKM, canFire, resolveShot, type Ray3 } from "../rules/combat";
import { ZombieActor } from "./ZombieActor";
```

2-2. `LEVEL_MODELS`를 교체:
```ts
export const LEVEL_MODELS = [...KIT_MODELS, "wpn_akm", "zombie1"];
```

2-3. `GameDebugHandle`에 두 필드 추가:
```ts
  fire(): string | null;
  zombies(): { id: string; hp: number; alive: boolean; x: number; z: number }[];
```

2-4. 클래스 필드 추가:
```ts
  private zombies: ZombieActor[] = [];
  private lastShotAt = -Infinity;
  private onZombiesChanged: ((remaining: number) => void) | undefined;
  private readonly aim = new THREE.Vector3();
```

2-5. `start` 시그니처와 본문 교체:
```ts
  async start(
    options: { onProgress?: (done: number, total: number) => void; onZombiesChanged?: (remaining: number) => void } = {},
  ): Promise<void> {
    const library = await ModelLibrary.load();
    await library.preload(LEVEL_MODELS, options.onProgress);
    // React StrictMode mounts twice; the first view may be gone by now.
    if (this.disposed) return;
    this.onZombiesChanged = options.onZombiesChanged;
    this.buildLevel(library);
    this.addLights();
    this.spawnZombies(library);
    this.viewmodel = new Viewmodel(this.camera, library.instance("wpn_akm"));
    this.clock.start();
    this.frame = requestAnimationFrame(this.tick);
  }
```

2-6. `debugHandle()`의 반환 객체에 추가:
```ts
      fire: () => this.shoot(),
      zombies: () => this.zombies.map((z) => ({ id: z.id, hp: z.hp, alive: z.alive, x: z.target().x, z: z.target().z })),
```

2-7. 메서드 추가:
```ts
  private spawnZombies(library: ModelLibrary): void {
    const clips = library.get("zombie1").animations;
    this.zombies = this.layout.zombieSpawns.map((spawn, i) => {
      const actor = new ZombieActor(`zombie-${i}`, library.instance("zombie1"), clips, spawn.x, spawn.z);
      this.scene.add(actor.object);
      return actor;
    });
    this.onZombiesChanged?.(this.zombies.length);
  }

  // Returns the id of the zombie hit, or null.
  private shoot(): string | null {
    this.lastShotAt = this.clock.elapsedTime;
    this.viewmodel?.fire();
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.aim);
    const ray: Ray3 = {
      ox: this.camera.position.x, oy: this.camera.position.y, oz: this.camera.position.z,
      dx: this.aim.x, dy: this.aim.y, dz: this.aim.z,
    };
    const hit = resolveShot(
      ray, this.zombies.map((z) => z.target()), (x, z) => solidAt(this.layout, x, z), AKM.range, TILE_SIZE,
    );
    if (!hit) return null;
    const zombie = this.zombies.find((z) => z.id === hit.id)!;
    if (zombie.takeHit(AKM.damage)) this.onZombiesChanged?.(this.zombies.filter((z) => z.alive).length);
    return hit.id;
  }
```

2-8. `tick` 안, `this.viewmodel?.update(...)` 바로 앞에 추가:
```ts
    if (this.input.firing && canFire(this.lastShotAt, this.clock.elapsedTime, AKM.fireInterval)) this.shoot();
    for (const zombie of this.zombies) zombie.update(dt, this.pose.x, this.pose.z);
```

- [ ] **Step 3: HUD에 남은 좀비 수** — `src/App.tsx`

`useState` 추가:
```tsx
  const [remaining, setRemaining] = useState<number | null>(null);
```
`view.start({...})` 인자를 교체:
```tsx
      .start({
        onProgress: (done, total) => !cancelled && setProgress({ done, total }),
        onZombiesChanged: (n) => !cancelled && setRemaining(n),
      })
```
`<div className="hud">` 줄을 교체:
```tsx
      <div className="hud">DUNGEON EYE{remaining !== null && ` · 남은 좀비 ${remaining}`}</div>
```

- [ ] **Step 4: 타입체크 + 전체 테스트**

Run: `npm run typecheck && npm test`
Expected: 에러 없음, 전체 PASS.

- [ ] **Step 5: 브라우저 확인**

1. 페이지 새로고침 후 `read_console_messages {onlyErrors: true}` → 0개. `zombie clip missing`이 나오면 에러 메시지의 `has ...` 목록과 Task 2 `export-list.json`의 클립 파일명을 대조해 고친다.
2. HUD에 `남은 좀비 2` 표시 확인 (`LEVEL_1`의 `Z` 2개).
3. 벽 너머 사격 확인 (좀비가 살아 있을 때 먼저):
   ```js
   const g = window.__game;
   g.setPose({ x: 22, z: 14, yaw: -Math.PI / 2, pitch: 0 });  // row 3 col 5, facing +x; zombie-0 is behind the col 6 wall
   ({ shot: g.fire(), zombies: g.zombies() })
   ```
   Expected: `shot: null`, `zombie-0`의 `hp: 100` 그대로.
4. 좀비 정면에 세우고 3발 — `javascript_tool`:
   ```js
   const g = window.__game;
   g.setPose({ x: 34, z: 22, yaw: 0, pitch: 0 });   // row 5 col 8, looking north at zombie-0 in row 3 col 8
   const hits = [];
   for (let i = 0; i < 3; i++) { hits.push(g.fire()); await new Promise((r) => setTimeout(r, 150)); }
   await new Promise((r) => setTimeout(r, 1500));
   ({ hits, zombies: g.zombies(), stats: g.stats() })
   ```
   Expected: `hits`가 `["zombie-0","zombie-0","zombie-0"]`, `zombie-0`의 `alive: false`, `hp: 0`, HUD `남은 좀비 1`. `stats.calls < 500`.
5. `computer {action: "screenshot"}` — 쓰러진 좀비가 보이는 장면을 남긴다.

- [ ] **Step 6: 커밋**

```bash
git add src
git commit -m "feat: shootable zombie targets with hit flash and death animation"
```

---

### Task 9: 에셋 라이선스 기록

배포 전 필수. 받은 에셋마다 Unity 에셋스토어 페이지의 라이선스 표기를 확인해 기록한다. "Standard Unity Asset Store EULA"면 게임에 포함하는 조건으로 Three.js 변환 사용 가능, 그 외(Restricted, 별도 라이선스)는 조건을 그대로 옮겨 적고 사용 가능 여부를 판단한다.

**Files:**
- Create: `docs/licenses/asset-provenance.md`

- [ ] **Step 1: 페이지별 확인**

아래 각 URL을 브라우저로 열고(`get_page_text`), 페이지의 License 항목 문구를 확인한다.

| art-src 폴더 | 에셋 | URL |
|---|---|---|
| Decrepit Dungeon LITE | Decrepit Dungeon LITE | https://assetstore.unity.com/packages/3d/environments/dungeons/decrepit-dungeon-lite-33936 |
| Free Low Poly Dungeon Pack | Free Low Poly Dungeon Pack | https://assetstore.unity.com/packages/3d/environments/dungeons/free-low-poly-dungeon-pack-398788 |
| Stylized Dungeon - Free Pack | Stylized Dungeon - Free Pack | https://assetstore.unity.com/packages/3d/environments/dungeons/stylized-dungeon-free-pack-178268 |
| Laterns and candles | Modular Medieval Lanterns | https://assetstore.unity.com/packages/3d/environments/historic/modular-medieval-lanterns-85527 |
| Treasure chest closed | Treasure Chest - PBR | https://assetstore.unity.com/packages/3d/props/interior/treasure-chest-pbr-72498 |
| CemeteryPack | Stylized Cemetery Pack | https://assetstore.unity.com/packages/3d/environments/stylized-cemetery-pack-56402 |
| Zombie | Zombie | https://assetstore.unity.com/packages/3d/characters/humanoids/zombie-30232 |
| fantasySpider | Free Fantasy Spider | https://assetstore.unity.com/packages/3d/characters/creatures/free-fantasy-spider-10104 |
| SiuniaevCharacters | GolemMonster | https://assetstore.unity.com/packages/3d/characters/creatures/golemmonster-33260 |
| PBRVelociraptor | PBR Velociraptors | https://assetstore.unity.com/packages/3d/characters/animals/pbr-velociraptors-165201 |
| FourEvilDragonsHP | Dragon for Boss Monster : HP | https://assetstore.unity.com/packages/3d/characters/creatures/dragon-for-boss-monster-hp-79398 |
| Weapons_ChamferZone | FPS AKM - Model & Textures | https://assetstore.unity.com/packages/3d/fps-akm-model-textures-63654 |
| DelthorGames | Free FPS Weapon - AKM | https://assetstore.unity.com/packages/3d/props/guns/free-fps-weapon-akm-180663 |
| Reichsrevolver_M1879 | Reichsrevolver M-1879 | https://assetstore.unity.com/packages/3d/props/guns/reichsrevolver-m-1879-63609 |
| GILD | FA: FPS Weapons Pack - Free | https://assetstore.unity.com/packages/3d/props/guns/fa-fps-weapons-pack-free-254020 |
| ManNeko_Assets | Adventurer Blake | https://assetstore.unity.com/packages/3d/characters/humanoids/adventurer-blake-158728 |
| BodyGuards | Bodyguards | https://assetstore.unity.com/packages/3d/characters/humanoids/humans/bodyguards-31711 |
| Yurowm | Contract Killer | https://assetstore.unity.com/packages/3d/characters/humanoids/humans/contract-killer-29235 |
| Homeless_people | Free Scavenger | https://assetstore.unity.com/packages/3d/characters/humanoids/humans/free-scavenger-261065 |
| IdiaSoftware | Zombie Free Character Sounds | 에셋스토어에서 "Zombie Free Character Sounds" 검색해 URL 확인 |

폴더 안에 `License`, `EULA`, `Readme` 파일이 있으면 그것도 읽는다:
```bash
find art-src -maxdepth 3 -iname "*licen*" -o -maxdepth 3 -iname "*eula*" -o -maxdepth 3 -iname "*readme*" | grep -v "\.meta$"
```

- [ ] **Step 2: 기록** — `docs/licenses/asset-provenance.md`

형식:
```markdown
# 에셋 출처와 라이선스

확인일: YYYY-MM-DD. 원본은 art-src/ (저장소 제외). 게임에 들어가는 것은 public/assets/models/의 변환본.

| 에셋 | 퍼블리셔 | 라이선스 표기 (페이지 문구 그대로) | Three.js 변환 사용 | 게임 사용처 |
|---|---|---|---|---|
| Decrepit Dungeon LITE | Prodigious Creations | Standard Unity Asset Store EULA | 가능 | dd_* 타일 |
```
표기가 Standard EULA가 아닌 항목은 "사용 가능" 칸에 `확인 필요`를 쓰고, 보고할 때 그 목록을 따로 적는다.

- [ ] **Step 3: 커밋**

```bash
git add docs/licenses/asset-provenance.md
git commit -m "docs: record license terms for imported Unity assets"
```

---

## 완료 기준 (Plan 1)

- `npm test`, `npm run typecheck`, `npm run build` 모두 통과
- 브라우저에서 방을 걸어다니고, 벽을 통과하지 못하고, AKM이 손에 보이고, 좀비 2마리를 쏴서 쓰러뜨릴 수 있음
- `stats().calls < 500` (데스크탑)
- `public/assets/models/` 30MB 이하
- `docs/licenses/asset-provenance.md`에 사용 에셋 전부 기록, `확인 필요` 항목은 보고됨
