import { useState, type FormEvent } from "react";
import type { FriendEntry, FriendsView } from "../game/account/friends";
import { friendProblem, sortFriends, type FriendsClient } from "../net/friends";

interface FriendsPanelProps {
  onClose: () => void;
  // Null while offline: friends live on the game server.
  client: FriendsClient | null;
  view: FriendsView | null;
}

function nameOf(entry: FriendEntry): string {
  return entry.nickname ?? "(이름 없음)";
}

// Right-hand side drawer: add a friend by nickname, answer requests, see who is online.
export function FriendsPanel({ onClose, client, view }: FriendsPanelProps) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  // One action at a time; `key` marks which button is working.
  const run = async (key: string, action: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (error) {
      setNotice(friendProblem(error));
    } finally {
      setBusy(null);
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!client || query.trim() === "") return;
    void run("add", async () => {
      const status = await client.request(query.trim());
      setQuery("");
      return status === "accepted" ? "서로 요청해서 바로 친구가 되었어요" : "친구 요청을 보냈어요";
    });
  };

  const remove = (entry: FriendEntry) => {
    if (!client) return;
    if (confirming !== entry.account) {
      setConfirming(entry.account);
      return;
    }
    setConfirming(null);
    void run(entry.account, async () => {
      await client.remove(entry.account);
      return null;
    });
  };

  const friends = view ? sortFriends(view.friends) : [];
  const onlineCount = friends.filter((f) => f.online).length;

  return (
    <aside className="friends-panel">
      <header>
        <h2>친구</h2>
        <button type="button" className="text-button" onClick={onClose}>닫기</button>
      </header>
      <form className="friend-add" onSubmit={add}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="닉네임으로 친구 추가"
          disabled={!client}
        />
        <button type="submit" className="text-button" disabled={!client || busy !== null || query.trim() === ""}>추가</button>
      </form>
      {notice && <p className="friend-notice">{notice}</p>}

      {!client && <p className="note">친구와 파티는 Verse8 서버를 연결한 뒤 열립니다.</p>}
      {client && !view && <p className="note">친구 목록을 불러오는 중…</p>}

      {view && view.incoming.length > 0 && (
        <>
          <h3>받은 요청 {view.incoming.length}</h3>
          <ul className="friend-list">
            {view.incoming.map((entry) => (
              <li key={entry.account}>
                <span className="friend-name">{nameOf(entry)}</span>
                <button type="button" className="text-button" disabled={busy !== null}
                  onClick={() => void run(entry.account, async () => {
                    await client!.accept(entry.account);
                    return `${nameOf(entry)}님과 친구가 되었어요`;
                  })}>수락</button>
                <button type="button" className="text-button" disabled={busy !== null}
                  onClick={() => void run(entry.account, async () => {
                    await client!.remove(entry.account);
                    return null;
                  })}>거절</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {view && (
        <>
          <h3>친구 목록 {friends.length > 0 && `· 온라인 ${onlineCount}/${friends.length}`}</h3>
          {friends.length === 0 && <p className="note">아직 친구가 없습니다. 닉네임으로 추가해 보세요.</p>}
          <ul className="friend-list">
            {friends.map((entry) => (
              <li key={entry.account} className={entry.online ? "online" : "offline"}>
                <span className="presence" aria-label={entry.online ? "온라인" : "오프라인"} />
                <span className="friend-name">{nameOf(entry)}</span>
                <button type="button" className="text-button" disabled={busy !== null} onClick={() => remove(entry)}>
                  {confirming === entry.account ? "정말 삭제" : "삭제"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {view && view.outgoing.length > 0 && (
        <>
          <h3>보낸 요청</h3>
          <ul className="friend-list">
            {view.outgoing.map((entry) => (
              <li key={entry.account}>
                <span className="friend-name">{nameOf(entry)}</span>
                <span className="friend-status">대기 중</span>
                <button type="button" className="text-button" disabled={busy !== null}
                  onClick={() => void run(entry.account, async () => {
                    await client!.remove(entry.account);
                    return null;
                  })}>취소</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
