# Traitor Hunt — 게임 디자인 스펙

게임 이름: **Traitor Hunt** (GitHub 저장소 `Jujeongmin/traitor-hunt`). 예전 작업명은 Dungeon Eye였고 2026-09-17에 바꿨다.

## 0. 무대와 이야기 (2026-09-17 결정)

"판타지 던전"을 고집하지 않는다. 무대는 **봉인된 고대 지하 유적**(지하 감옥·지하 묘지)이다.
현대 무장 탐사대 4명이 유적에 들어간다. 유적 깊은 곳에 잠든 무언가가 생물과 사람에게 깃들고,
탐사대 중 한 명은 이미 그것에 씌어 있다(배신자). 그래서 배신자는 유적의 생물에 옮겨 들어갈 수 있다(빙의).

- 좀비: 먼저 들어왔다가 당한 사람들
- 거미·골렘·드래곤 같은 괴물: 유적에 잠들어 있던 고대 존재 (Plan 4 이후)
- 사람·무기: 현대 탐사대와 총기 (지금 에셋 그대로)
- 맵: 돌벽·횃불·감옥·지하 묘지 (Decrepit Dungeon 킷 그대로), 판 안 목표는 유적의 봉인 장치·열쇠·문

## 1. 로그라인

4인 코옵 3D FPS 지하 유적 탈출 게임. 그 중 1명은 서버만 아는 숨은 배신자다.
배신자도 겉보기엔 똑같이 총 들고 싸우는 모험가지만, 게이지가 차면 근처 몬스터에
**원격 빙의**할 수 있다. 이때 배신자의 본체는 그 자리에 얼어붙은 채 남고, 빙의한
몬스터가 입는 피해 일부가 실시간으로 본체에도 되돌아온다 — 몬스터를 잡았는데
멀리 있던 동료가 갑자기 비명을 지르며 피를 흘리는 순간이 이 게임의 핵심 장면이다.

## 2. 기존 게임과의 차이 (경쟁 조사 결과)

- **Deceit**(2017), **SurvHive**: 숨은 배신자가 FPS에서 몬스터로 변신하는 컨셉은
  이미 존재한다. 다만 두 게임 모두 배신자 **본인이 그 자리에서 변신**하는 방식이라
  "몸이 두 개"가 되는 순간이 없다.
- **Cursebreakers**: 1인칭 코옵 던전크롤러지만 배신자 메커니즘은 없음(자원 분배 갈등만).
- **차별점**: 본체와 빙의체가 **물리적으로 분리된 채 대미지로 연결**된다는 것.
  탐지 단서가 "저 사람 몬스터랑 닮았다"가 아니라 "몬스터 잡았는데 쟤가 아팠다"는
  인과관계로 드러난다. 장르도 아레나 슈터가 아니라 루팅/탈출형 던전크롤러.

## 3. 핵심 루프

1. **로비** — 4명 매칭 (Agent8 GameServer 룸)
2. **역할 배정** — 서버가 1명을 배신자로 무작위 배정, 클라이언트 어디에도 노출 안 함
3. **던전 진입** — 전원 1인칭으로 이동/전투/루팅하며 탈출구까지 진행
4. **배신자 사보타주** — 조종 게이지가 차면 근처 몬스터에 빙의해 기습 또는 함정 유발
5. **종료** — 제한시간 내 지정 탈출구 도달(모험가 승) / 모험가 전멸 또는 시간초과(배신자 승)
6. **결과창** — 배신자 정체 공개, 전적 기록

## 4. 배신자 메커니즘 (핵심 시스템)

### 4.1 조종 게이지
- 이동/전투 중 자연 충전 (시간 기반, 완전 충전까지 초기값 60초 — 추정치, 플레이테스트로 조정)
- 완전 충전 + 반경 N미터 내 "조종 가능 몬스터" 존재 시에만 발동 가능

### 4.2 빙의 상태
- 발동 시 배신자 카메라가 해당 몬스터로 전환, 몬스터의 이동/공격 능력으로 직접 조작
- 지속시간 8초 (추정치), 종료 시 자동으로 본체로 복귀, 쿨다운 45초 (추정치)
- 빙의 중 본체는 "환각/실신" 애니메이션으로 그 자리에 고정 — 이동/사격 불가
- 총은 몬스터에게만 맞는다. 얼어붙은 본체를 쏴서 빙의를 끊는 방법은 없다(2026-09-17 변경).

### 4.3 연결 대미지 (차별점 핵심)
- 빙의한 몬스터가 받는 피해의 40% (추정치)가 실시간으로 본체 HP에도 적용
- 몬스터가 빙의 중 사망하면: 강제 해제 + 본체에 큰 피해(스턴 + 출혈 이펙트, 비명 사운드)
- 이 사운드/이펙트는 **주변 반경에 있는 팀원에게만** 들리고 보임 — 즉 "누가 몬스터를 잡았는데
  근처 동료가 갑자기 고통스러워했다"는 정황 증거를 만들어냄. 전체 공지가 아니라
  근접한 사람만 목격하게 해서 오인/거짓 신고 여지도 남긴다.

### 4.4 승리조건
- 모험가 승: 생존자 전원(또는 정의할 최소 인원 — **미결정, 아래 5번 참고**)이 제한시간 내
  탈출구 도달
- 배신자 승: 모험가 전원 사망 또는 제한시간 초과

## 5. 확정된 규칙 (2026-09-17)

- 모험가 승리: 배신자를 뺀 살아 있는 모험가 전원이 탈출. 모험가가 모두 죽거나 시간(8분)이 끝나면 배신자 승.
- 체력: 모두 100. 경기 중 나가면 사망 처리.
- 빙의: 시작 60초 후부터, 지속 8초, 끝난 뒤 45초 쿨다운, 12m 이내 몬스터.
- 연결 대미지: 받은 피해의 40%, 빙의 몬스터가 죽으면 본체에 추가 35. 비명은 본체 반경 10m 안의 다른 플레이어에게만.
- 플레이어끼리는 서로 쏠 수 없다. 배신자도 사람을 쏠 수 없고, 사람에게 피해를 주는 길은 빙의한 몬스터뿐이다(2026-09-17 변경, 예전의 아군 사격·본체 사격 규칙은 삭제).
- 배신자를 찾아내는 방법은 총이 아니라 "몸으로 투표"다. 세부 규칙은 11장(2026-09-17 개정).
- 정체 숨기기는 단순 방식(보관 위치만 예측 어렵게). 기술적으로 뜯어보는 플레이어는 알아낼 수 있음을 감수.
- 수치는 전부 `src/game/match/constants.ts`에 있고 플레이테스트로 조정한다.

## 6. 던전 구조 / 콘텐츠 범위 (MVP)

- 고정 맵 1개로 시작 (절차생성은 이후 버전)
- 조종 가능 몬스터 2~3종, 조종 불가 일반 몬스터(장식/위협용) 별도
- 무기 1~2종 (근접 또는 원거리 하나씩)
- 루팅 요소는 최소 범위로 시작 (탄약/체력 회복 아이템 정도)

## 7. 기술 아키텍처

- **렌더링**: Three.js, 1인칭 컨트롤러 + 무기 시스템 신규 개발 (참고 프로젝트 dungeon-warden엔
  FPS 뷰가 없어 컨트롤러 자체는 새로 만들어야 함. 애니메이션 리깅 패턴, 에셋 압축 파이프라인만 재사용)
- **네트워킹**: `@agent8/gameserver` — 룸 매칭, 실시간 위치/상태 동기화
- **서버 권위(authoritative) 필수 지점**:
  - 배신자 역할 배정과 노출 여부 — 클라이언트는 절대 알 수 없어야 함
  - 빙의 발동 조건 검증(역할·게이지·근접 몬스터) 후 전체 클라에 "몬스터 조종권 이관" 브로드캐스트
  - 연결 대미지 계산 — 클라 조작으로 대미지 무시 못 하게 서버가 계산해서 통보
- **데이터 저장**: 매치 결과/전적은 [메모리: Verse8 Firestore 저장 한도] 규칙에 따라 컬렉션으로
  분리 (문서당 1MB, 인덱스 4만 제한 고려)

## 8. 에셋 방향 및 예산

- **목표 톤**: "포토리얼" 아님. Lethal Company·Deceit 수준의 **PBR 중간폴리곤 + 어두운 조명
  스타일라이즈드 리얼**이 현실적 상한선
- **폴리곤/드로우콜 예산** (2026년 Three.js FPS 기준)
  - 데스크탑: 화면당 50만~100만 트라이앵글, 드로우콜 500개 이하
  - 모바일: 화면당 5만~10만 트라이앵글, 드로우콜 100개 이하 (Verse8이 모바일 웹도 타겟이라
    이 기준이 실질 상한)
- **압축 파이프라인**: dungeon-warden에 이미 구축된 `gltf-transform` + `meshoptimizer` + `sharp`
  파이프라인 재사용
- **주의**: bastion-line에서 2D 픽셀 게임임에도 원격 에셋 38MB를 한 번에 받다가 모바일에서
  로드 실패가 난 전례 있음. 3D는 용량이 훨씬 크므로 씬 진입 시 필요한 에셋만 우선 로드하는
  단계적 로딩 설계가 필수

## 9. 에셋 후보 (Unity 에셋스토어, 다운로드 후 glTF 변환 대상)

**주의**: 아래는 제목/카테고리 자체가 "Free"인 항목만 추렸다(에셋스토어 공식 무료 큐레이션
리스트 포함). 그래도 다운로드 직전엔 페이지에서 가격 $0 표시와 라이선스(재배포·타 엔진 변환·
상업 이용 허용 여부)를 직접 다시 확인해야 한다. 비공식 "무료 다운로드" 미러 사이트
(예: unityassetcollection.com, unityassets4free.com류)는 정품 유료 에셋을 무단 재배포하는
경우가 있어 후보에서 제외했다 — 반드시 assetstore.unity.com 공식 링크만 사용.

| 용도 | 후보 | 링크 |
|---|---|---|
| 던전 환경 — 1순위 | Decrepit Dungeon LITE (Prodigious Creations, 188개 평점) — 이름·평점 다 부합 | https://assetstore.unity.com/packages/3d/environments/dungeons/decrepit-dungeon-lite-33936 |
| 던전 환경 | Free Low Poly Dungeon Pack | https://assetstore.unity.com/packages/3d/environments/dungeons/free-low-poly-dungeon-pack-398788 |
| 던전 환경 | Stylized Dungeon - Free Pack | https://assetstore.unity.com/packages/3d/environments/dungeons/stylized-dungeon-free-pack-178268 |
| 던전 환경 | Free Simple Dungeon Props | https://assetstore.unity.com/packages/3d/environments/dungeons/free-simple-dungeon-props-225521 |
| 던전 환경 — 조명 소품 | Modular Medieval Lanterns (63개 평점) — 어두운 톤 조성에 중요 | https://assetstore.unity.com/packages/3d/environments/historic/modular-medieval-lanterns-85527 |
| 던전 환경 — 분위기 보조 | Stylized Cemetery Pack (20개 평점) | https://assetstore.unity.com/packages/3d/environments/stylized-cemetery-pack-56402 |
| 던전 환경 — 루팅 소품 | Treasure Chest - PBR (36개 평점) | https://assetstore.unity.com/packages/3d/props/interior/treasure-chest-pbr-72498 |
| 던전 환경(큐레이션, 추가 탐색용) | Free Dungeon Assets 목록 | https://assetstore.unity.com/lists/free-dungeon-assets-81248 |
| 몬스터 — 조종 가능 후보 1 | Zombie (PXLTIGER, 782개 평점) | https://assetstore.unity.com/packages/3d/characters/humanoids/zombie-30232 |
| 몬스터 — 조종 가능 후보 2 | Free Fantasy Spider (Kalamona, 240개 평점) | https://assetstore.unity.com/packages/3d/characters/creatures/free-fantasy-spider-10104 |
| 몬스터 — 보스/탱커 | GolemMonster (Siuniaev, 32개 평점) | https://assetstore.unity.com/packages/3d/characters/creatures/golemmonster-33260 |
| 몬스터 — 리얼 PBR 야수 | PBR Velociraptors (17개 평점) | https://assetstore.unity.com/packages/3d/characters/animals/pbr-velociraptors-165201 |
| 몬스터 — 보스 후보 | Dragon for Boss Monster : HP (Dungeon Mason) | https://assetstore.unity.com/packages/3d/characters/creatures/dragon-for-boss-monster-hp-79398 |
| 몬스터 — 확인 필요(리깅 여부 불명) | Feline Gargoyle (카테고리가 props라 정적 모델일 가능성) | https://assetstore.unity.com/packages/3d/props/feline-gargoyle-27106 |
| 몬스터(큐레이션, 추가 탐색용) | Free Fantasy Creatures 목록 | https://assetstore.unity.com/lists/free-fantasy-creatures-11348 |
| 몬스터(큐레이션, 추가 탐색용) | Free Monsters 목록 | https://assetstore.unity.com/lists/free-monsters-14593 |
| FPS 무기 — 주력 소총 후보 1 | FPS AKM - Model & Textures (ChamferZone, 153개 평점) | https://assetstore.unity.com/packages/3d/fps-akm-model-textures-63654 |
| FPS 무기 — 주력 소총 후보 2 | Free FPS Weapon - AKM (Delthor Games) | https://assetstore.unity.com/packages/3d/props/guns/free-fps-weapon-akm-180663 |
| FPS 무기 — 주력 소총 후보 3 | Assault Rifle A3 (35개 평점) | https://assetstore.unity.com/packages/3d/props/guns/assault-rifle-a3-2107 |
| FPS 무기 — 보조무기 | Reichsrevolver M-1879 (41개 평점, 리얼 계열 리볼버) | https://assetstore.unity.com/packages/3d/props/guns/reichsrevolver-m-1879-63609 |
| FPS 무기 — 보조무기 | Free FPS Weapon - MP7 | https://assetstore.unity.com/packages/3d/props/guns/free-fps-weapon-mp7-177246 |
| FPS 무기 — 세트팩 | FA: FPS Weapons Pack - Free | https://assetstore.unity.com/packages/3d/props/guns/fa-fps-weapons-pack-free-254020 |
| FPS 무기(큐레이션, 추가 탐색용) | Best Free Weapons 목록 | https://assetstore.unity.com/lists/best-free-weapons-42298 |
| 사람 캐릭터 — 1순위 | Adventurer Blake (ManNeko) — 던전 모험가 테마 그대로, 권총+PBR+Humanoid 애니메이션 세트 동봉, 즐겨찾기 748 | https://assetstore.unity.com/packages/3d/characters/humanoids/adventurer-blake-158728 |
| 사람 캐릭터 — 2순위 | Bodyguards (Batewar, 173개 평점) — 리얼 계열, 캐릭터 3+보너스 1 | https://assetstore.unity.com/packages/3d/characters/humanoids/humans/bodyguards-31711 |
| 사람 캐릭터 — 3순위 | Contract Killer (실제 다운로드본 퍼블리셔는 Yurowm) — 캐릭터+권총/저격총 모델+**FPS 사격 애니메이션 풀세트**(Idle/Walk/Run/Crouch/Jump/Sneak + 권총1정·2정·저격총별 Fire 모션, Animator Controller 4개 포함) 동봉. 무기 애니메이션 기반 자산으로 최우선 활용 | https://assetstore.unity.com/packages/3d/characters/humanoids/humans/contract-killer-29235 |
| 사람 캐릭터 — 다양성용 | 3 Free Characters (HONETi, 149개 평점, 즐겨찾기 1363) | https://assetstore.unity.com/packages/3d/characters/humanoids/fantasy/3-free-characters-18098 |
| 사람 캐릭터 — 테마 보조 | Free Scavenger (Paul N.) — 던전 생존자 컨셉과 잘 맞음 | https://assetstore.unity.com/packages/3d/characters/humanoids/humans/free-scavenger-261065 |
| 사람 캐릭터(필터 적용된 검색, 추가 탐색용) | 에셋스토어 무료 캐릭터 전체 | https://assetstore.unity.com/?category=3d%2Fcharacters&free=true&orderBy=1 |

**주의**:
- "FPS AKM - Model & Textures"는 이름상 모델+텍스처만 포함하고 리깅/사격 애니메이션은
  없을 가능성이 있음 — 다행히 Contract Killer(Yurowm) 팩에 사격/이동 애니메이션 풀세트가
  이미 있으므로 그걸 리타겟해서 쓰면 이 문제 해결됨. Mixamo는 그래도 안 될 때의 대안으로만.
- 사람 캐릭터 중 진짜 "리얼한" 편은 Bodyguards·Contract Killer·Adventurer Blake 정도고
  나머지는 스타일라이즈드에 가까움. 더 사실적인 게 필요하면 **Adobe Mixamo**(무료, 계정만
  필요, https://www.mixamo.com )가 대안 — 리깅된 인간형 + 방대한 애니메이션을 FBX로 제공,
  Three.js/glTF 파이프라인으로 옮긴 사례도 많아 dungeon-warden 압축 파이프라인과 궁합 좋음.

**플레이어 캐릭터 결정 (2026-09-17)**: Contract Killer 캐릭터는 게임과 어울리지 않아 쓰지 않는다.
나중에 코스튬(외형 교체)을 넣을 것이므로, 새 캐릭터는 부위별로 나뉜 모듈형이거나 같은 뼈대를 쓰는
여러 외형이 있는 에셋으로 고른다. 정해질 때까지 다른 플레이어는 임시 마네킹으로 보인다.
→ 2026-09-17 결정: **Adventure Character**(Maksim Bugrimov)를 쓴다. 17개 부위 메시를 모두 담은 `explorer` 모델 하나를 내보내고,
코스튬은 보일 부위 목록으로 정한다(`src/game/render/costumes.ts`: 탐험가·수색대·복면 대원). 동작은 Human Soldier Animations FREE
(Kevin Iglesias)의 소총 조준·달리기·쓰러짐을 입히고, 달릴 때는 다리만 달리기 동작을 쓰고 상체는 조준 자세를 유지한다.
옷 색(상·하의 3색) 바꾸기는 코스튬 작업 때 더한다.
Contract Killer 팩의 소총 애니메이션(Idle/Run/Death_Rifle)은 새 캐릭터에 재사용할 수 있다.

파일 받으면 전달해줄 것 — 받는 대로 라이선스 조건 같이 확인하고 `gltf-transform` 변환
파이프라인에 태우겠음.

## 10. 장기 성장 구조 (2026-09-17 결정)

한 판으로 끝나지 않게 세 가지를 넣는다. 서버는 판마다 사람별 결과(`match_results` 컬렉션)와 누적 전적(사용자 상태 `profile`)을 남기고, 세 기능은 이 기록을 읽어 계산한다.

- 계정 레벨·해금: 판마다 경험치, 레벨에 따라 무기·외형·맵·몬스터 해금
- 미션·업적: 일일/주간 미션과 업적 (예: 배신자에게 피해 주기, 빙의 성공)
- 랭킹·시즌: 모험가·배신자 역할별 점수와 순위, 기간제 시즌과 보상

각 기능의 수치·목록은 해당 구현 계획 전에 따로 설계한다. 전체 순서는 Plan 2 문서의 로드맵을 따른다.

## 11. 판 안 협동 목표와 몸으로 투표 (2026-09-17 결정, Plan 4)

한 판은 20분 제한이고, 아래 단계를 차례로 풀어야 출구가 열린다. 단계와 문은 모두가 보는 방 상태(`match.objectives`)에 있다.

| 단계 | 할 일 | 끝나면 |
|---|---|---|
| 1. 룬 조각 (`shards`) | 입구 구역에 흩어진 룬 조각 2개를 줍고(E), 봉인문 1 앞에서 끼운다(E) | 문 1이 열린다 |
| 2. 고대 장치 (`devices`) | 멀리 떨어진 장치 2개를 작동(E). 작동은 8초 유지되고, 둘이 동시에 켜져 있어야 한다 | 문 2가 열린다 |
| 3. 봉인 해제 (`seal`) | 제단에서 봉인 해제를 시작(E). 제단 6m 안에 산 사람이 있을 때만 60초 진행. 0·20·40초에 좀비 3마리씩 물결 | 문 3이 열리고 보스가 나온다 |
| 4. 보스 (`boss`) | 보스(체력 800, 공격 35, 빙의 불가)를 쓰러뜨린다 | 출구가 열린다 |
| 5. 탈출 (`exit`) | 배신자를 뺀 살아 있는 모험가가 모두 출구에서 탈출(F) | 모험가 승리 |

- 맵은 `RUINS`(25×13칸, 한 칸 4m): 시작 구역 → 문 1 → 장치 구역 → 문 2 → 제단 구역 → 문 3 → 보스 방(출구 포함).
- 조작: E 상호작용, Q 빙의(배신자), R 빙의 해제, F 탈출, 클릭 사격.

**몸으로 투표 (룬 발판, 2026-09-17 개정)**
- 문 1·2·3이 열릴 때마다 투표가 한 번씩 열린다(한 판 최대 3번). 배신자가 드러나면 더 열리지 않는다.
- 투표가 열리면 룬 발판 5개(사람 수만큼 이름 발판 + "건너뛰기" 1개)가 살아 있는 사람들의 가운데 근처, 발판이 모두 들어가는
  넓은 바닥에 위에서 쿵 떨어진다. 닫힌 문 너머나 벽에는 놓지 않고, 사람들이 걸어서 갈 수 있는 곳만 고른다.
- 제한시간 30초. 발판 위(1.2m)에 서 있는 것이 한 표다. 자기 이름 발판에 선 것은 표로 치지 않는다.
- 살아 있는 사람의 과반(넷이면 3명)이 한 발판에 3초 서 있으면 바로 결정된다.
- 시간이 다 되면 그때 서 있는 표만 센다. 가장 많은 발판으로 결정된다(넷 중 한 명만 섰으면 그 한 표로 결정).
  아무도 안 섰거나, "건너뛰기"가 가장 많거나, 동점이면 그냥 넘어간다.
- 지목된 사람이 배신자면 정체가 공개되고(`match.revealed`) 그 판 동안 빙의가 봉인된다.
- 무고하면 그 사람이 20초 동안 묶인다(이동·사격·상호작용 불가, `match.bound`). 묶인 배신자도 빙의는 할 수 있다(몸만 묶임).
- 투표 중에도 몬스터와 목표는 멈추지 않는다.

**봇 (2026-09-17 결정)**
- 봇은 사람처럼 보이게 다듬는다: 반응 지연(0.3~0.8초), 조준 흔들림(거리 따라 명중률 35~85%), 부드러운 회전, 경로 흔들림, 가끔 멈춰 두리번거림.
- 봇은 목표를 차례로 수행한다. 투표가 열리면, 비명을 들은 뒤 의심 가는 사람이 있으면 그 사람의 발판에 서고, 없으면 다른 사람이 1.5초 넘게 서 있는 발판을 따라가거나 8초 뒤 "건너뛰기"에 선다. 배신자 봇은 남을 따라가거나 건너뛴다.
- 쓰임: 연습 모드(나 + 봇 3명). 온라인에서는 사람이 모이지 않을 때만 빈자리를 봇으로 채우고, 봇은 배신자가 되지 않는다(빈자리 채우기는 온라인 연결 뒤 별도 계획).
