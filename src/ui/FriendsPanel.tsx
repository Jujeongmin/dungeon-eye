import { useState } from "react";

interface FriendsPanelProps {
  onClose: () => void;
  // Friends and parties live on the game server, so the panel only works once it is connected.
  online: boolean;
}

// Right-hand side drawer: add a friend by nickname, or invite one from the list into your party.
export function FriendsPanel({ onClose, online }: FriendsPanelProps) {
  const [query, setQuery] = useState("");
  return (
    <aside className="friends-panel">
      <header>
        <h2>친구</h2>
        <button type="button" className="text-button" onClick={onClose}>닫기</button>
      </header>
      <form className="friend-add" onSubmit={(e) => e.preventDefault()}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="닉네임으로 친구 추가"
          disabled={!online}
        />
        <button type="submit" className="text-button" disabled={!online || query.trim() === ""}>추가</button>
      </form>
      <h3>친구 목록</h3>
      <p className="note">
        {online ? "아직 친구가 없습니다. 닉네임으로 추가해 보세요." : "친구와 파티는 Verse8 서버를 연결한 뒤 열립니다."}
      </p>
    </aside>
  );
}
