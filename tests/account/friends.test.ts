import { describe, expect, it } from "vitest";
import {
  FRIEND_LIMIT, ONLINE_WINDOW_MS, REQUEST_LIMIT, acceptFriend, emptyFriendLists, isOnline, readFriendLists,
  removeFriend, requestFriend, type FriendSide,
} from "../../src/game/account/friends";

function side(account: string): FriendSide {
  return { account, lists: emptyFriendLists() };
}

describe("requestFriend", () => {
  it("puts the request in both lists", () => {
    const a = side("a");
    const b = side("b");
    expect(requestFriend(a, b)).toBe("requested");
    expect(a.lists.outgoing).toEqual(["b"]);
    expect(b.lists.incoming).toEqual(["a"]);
  });

  it("asking twice changes nothing", () => {
    const a = side("a");
    const b = side("b");
    requestFriend(a, b);
    requestFriend(a, b);
    expect(a.lists.outgoing).toEqual(["b"]);
    expect(b.lists.incoming).toEqual(["a"]);
  });

  it("becomes friends at once when the other side already asked", () => {
    const a = side("a");
    const b = side("b");
    requestFriend(b, a);
    expect(requestFriend(a, b)).toBe("accepted");
    expect(a.lists).toEqual({ friends: ["b"], incoming: [], outgoing: [] });
    expect(b.lists).toEqual({ friends: ["a"], incoming: [], outgoing: [] });
  });

  it("refuses yourself, an existing friend and full lists", () => {
    const a = side("a");
    const b = side("b");
    expect(() => requestFriend(a, side("a"))).toThrow("friend_self");
    requestFriend(a, b);
    acceptFriend(b, a);
    expect(() => requestFriend(a, b)).toThrow("already_friends");

    const full = side("full");
    full.lists.friends = Array.from({ length: FRIEND_LIMIT }, (_, i) => `f${i}`);
    expect(() => requestFriend(full, side("c"))).toThrow("friend_limit");
    expect(() => requestFriend(side("c"), full)).toThrow("friend_limit");

    const popular = side("popular");
    popular.lists.incoming = Array.from({ length: REQUEST_LIMIT }, (_, i) => `r${i}`);
    expect(() => requestFriend(side("c"), popular)).toThrow("request_limit");
  });
});

describe("acceptFriend", () => {
  it("needs a request from them", () => {
    expect(() => acceptFriend(side("a"), side("b"))).toThrow("no_request");
  });

  it("refuses when either list is full", () => {
    const a = side("a");
    const b = side("b");
    requestFriend(b, a);
    a.lists.friends = Array.from({ length: FRIEND_LIMIT }, (_, i) => `f${i}`);
    expect(() => acceptFriend(a, b)).toThrow("friend_limit");
  });
});

describe("removeFriend", () => {
  it("unfriends, declines and cancels, from either side", () => {
    const a = side("a");
    const b = side("b");
    requestFriend(a, b);
    removeFriend(b, a);
    expect([a.lists, b.lists]).toEqual([emptyFriendLists(), emptyFriendLists()]);

    requestFriend(a, b);
    removeFriend(a, b);
    expect([a.lists, b.lists]).toEqual([emptyFriendLists(), emptyFriendLists()]);

    requestFriend(a, b);
    acceptFriend(b, a);
    removeFriend(a, b);
    expect([a.lists, b.lists]).toEqual([emptyFriendLists(), emptyFriendLists()]);
  });
});

describe("readFriendLists", () => {
  it("keeps only account strings and drops the rest", () => {
    expect(readFriendLists({ friends: ["a", 3, "b"], incoming: "x" })).toEqual({ friends: ["a", "b"], incoming: [], outgoing: [] });
    expect(readFriendLists(undefined)).toEqual(emptyFriendLists());
  });
});

describe("isOnline", () => {
  it("is online while the last heartbeat is recent", () => {
    expect(isOnline(1_000, 1_000 + ONLINE_WINDOW_MS)).toBe(true);
    expect(isOnline(1_000, 1_001 + ONLINE_WINDOW_MS)).toBe(false);
    expect(isOnline(undefined, 0)).toBe(false);
  });
});
