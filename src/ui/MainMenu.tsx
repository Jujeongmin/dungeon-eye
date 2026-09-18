import { useEffect, useRef, useState } from "react";
import { MenuScene } from "../game/render/MenuScene";
import { ownName } from "../game/render/names";
import { FriendsPanel } from "./FriendsPanel";
import { NicknamePanel } from "./NicknamePanel";
import { myCostume, onMyCostume } from "./profile";
import { SettingsPanel } from "./SettingsPanel";

interface MainMenuProps {
  account: string;
  // Your server nickname; null while offline, loading, or not yet picked.
  nickname: string | null;
  // Null until the server account has loaded.
  onSaveNickname: ((nickname: string) => Promise<void>) | null;
  accountFailed: boolean;
  onPractice: () => void;
  onOnline: () => void;
  onlineAvailable: boolean;
}

type Sheet = "none" | "settings" | "help";

export function MainMenu({
  account, nickname, onSaveNickname, accountFailed, onPractice, onOnline, onlineAvailable,
}: MainMenuProps) {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<MenuScene | null>(null);
  const [loading, setLoading] = useState(0);
  const [costume, setCostume] = useState(myCostume());
  const [sheet, setSheet] = useState<Sheet>("none");
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const name = nickname ?? ownName(account);
  const onlineReady = onlineAvailable && nickname !== null;
  const onlineNote = !onlineAvailable
    ? "빠른 시작은 Verse8 서버를 연결한 뒤 열립니다."
    : accountFailed
      ? "계정 정보를 불러오지 못했습니다. 새로고침해 주세요."
      : !onSaveNickname
        ? "계정 정보를 불러오는 중…"
        : null;

  useEffect(() => onMyCostume(setCostume), []);

  useEffect(() => {
    const container = stage.current;
    if (!container) return;
    const next = new MenuScene(container);
    scene.current = next;
    void next.start((done, total) => setLoading(done / total)).then(() => setLoading(1));
    return () => {
      scene.current = null;
      next.dispose();
    };
  }, []);

  // Party members join here once invites are live; for now it is you alone.
  useEffect(() => {
    scene.current?.setParty([{ name, costume, isYou: true }]);
  }, [name, costume, loading]);

  const go = (start: () => void) => {
    if (leaving) return;
    setLeaving(true);
    if (scene.current) scene.current.enter(start);
    else start();
  };

  return (
    <div className="main-menu">
      <div className="menu-stage" ref={stage} />
      {loading < 1 && <div className="menu-loading band">유적을 여는 중… {Math.round(loading * 100)}%</div>}

      <div className="menu-profile band">
        <span className="menu-level">Lv 1</span>
        {onSaveNickname ? (
          <button type="button" className="menu-name name-button" title="닉네임 바꾸기" onClick={() => setRenaming(true)}>
            {name}
          </button>
        ) : (
          <span className="menu-name">{name}</span>
        )}
      </div>

      <div className="menu-corner">
        <button type="button" className="brush-button small" onClick={() => setFriendsOpen((v) => !v)}>친구</button>
        <button type="button" className="brush-button small" onClick={() => setSheet("settings")}>설정</button>
      </div>

      <nav className="menu-left">
        <h1>TRAITOR HUNT</h1>
        <button type="button" className="brush-button" onClick={() => go(onOnline)} disabled={!onlineReady || leaving}>빠른 시작</button>
        <button type="button" className="brush-button" onClick={() => go(onPractice)} disabled={leaving}>연습 (봇 3명)</button>
        <button type="button" className="brush-button" disabled>코스튬 (개발 중)</button>
        <button type="button" className="brush-button" disabled>전적 · 랭킹 (개발 중)</button>
        <button type="button" className="brush-button" onClick={() => setSheet("help")}>게임 방법</button>
        {onlineNote && <p className="note">{onlineNote}</p>}
      </nav>

      {friendsOpen && <FriendsPanel onClose={() => setFriendsOpen(false)} online={onlineAvailable} />}

      {onSaveNickname && (nickname === null || renaming) && (
        <NicknamePanel
          current={nickname}
          onSave={onSaveNickname}
          onClose={nickname === null ? undefined : () => setRenaming(false)}
        />
      )}

      {sheet === "settings" && <SettingsPanel onClose={() => setSheet("none")} />}
      {sheet === "help" && (
        <div className="menu-modal" onClick={() => setSheet("none")}>
          <div className="dark-panel help-panel" onClick={(e) => e.stopPropagation()}>
            <h2>게임 방법</h2>
            <p>네 명이 봉인된 유적에 갇혔습니다. 열쇠를 모으고 장치를 작동해 문을 열고, 제단의 보스를 쓰러뜨린 뒤 탈출하세요.</p>
            <p>그중 한 명은 배신자입니다. 배신자는 총으로 동료를 쏠 수 없고, 몬스터에 빙의해서만 공격합니다.</p>
            <p>문이 열릴 때마다 투표 발판이 떨어집니다. 30초 안에 의심 가는 사람의 발판에 서세요. 배신자를 맞히면 빙의가 봉인되고, 틀리면 그 사람이 20초 동안 묶입니다.</p>
            <p className="note">WASD 이동 · 마우스 조준 · 클릭 사격 · E 상호작용 · Q 빙의(배신자)</p>
            <button type="button" className="text-button" onClick={() => setSheet("none")}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
