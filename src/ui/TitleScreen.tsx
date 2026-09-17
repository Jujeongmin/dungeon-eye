interface TitleScreenProps {
  onPractice: () => void;
  onOnline: () => void;
  onlineAvailable: boolean;
}

export function TitleScreen({ onPractice, onOnline, onlineAvailable }: TitleScreenProps) {
  return (
    <div className="overlay title-screen">
      <h1>TRAITOR HUNT</h1>
      <p className="tagline band">넷 중 한 명은 배신자다. 몬스터에 빙의한 배신자를 찾아내고, 살아서 탈출하라.</p>
      <div className="buttons">
        <button type="button" className="brush-button" onClick={onPractice}>연습 (봇 3명)</button>
        <button type="button" className="brush-button" onClick={onOnline} disabled={!onlineAvailable}>온라인 매치</button>
      </div>
      {!onlineAvailable && <p className="note">온라인 매치는 Verse8 프로젝트를 연결한 뒤 열립니다.</p>}
    </div>
  );
}
