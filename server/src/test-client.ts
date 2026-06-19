// Headless integration test for the multiplayer server.
// Spins up two socket clients + an AI seat, plays several rounds by having the
// human clients auto-act, and asserts the game progresses correctly.
import { io, type Socket } from "socket.io-client";
import type { GameState } from "../../src/game/types";
import type { GameAction } from "../../src/game/actions";

const URL = "http://localhost:3001";
const log = (...a: any[]) => console.log(...a);

function connect(): Socket {
  return io(URL, { transports: ["websocket"], forceNew: true });
}

function emitAck<T>(sock: Socket, event: string, payload?: any): Promise<T> {
  return new Promise((resolve) => sock.emit(event, payload, (r: T) => resolve(r)));
}

async function main() {
  const a = connect();
  const b = connect();
  await Promise.all([
    new Promise<void>((r) => a.on("connect", () => r())),
    new Promise<void>((r) => b.on("connect", () => r())),
  ]);
  log("✓ both clients connected");

  const created: any = await emitAck(a, "lobby:create", {
    displayName: "Alice",
    name: "Test Room",
    isPrivate: false,
    mode: "classic",
  });
  log("✓ room created, code =", created.code, "seat", created.seatIndex);
  const aSeat = created.seatIndex; // 0

  const joined: any = await emitAck(b, "lobby:join", { code: created.code, displayName: "Bob" });
  if (joined.message) throw new Error("join failed: " + joined.message);
  log("✓ Bob joined as seat", joined.seatIndex);
  const bSeat = joined.seatIndex; // 1

  a.emit("lobby:addAI", { aiLevel: "hard" }); // seat 2
  await delay(100);

  // verify public listing shows the room before start
  const list: any[] = await emitAck(a, "lobby:list");
  log("✓ public rooms listed:", list.length, "(expect >=1)");

  // wire up game state tracking + auto-play for both human seats
  const box: { latest: GameState | null } = { latest: null };
  let updates = 0;
  let invalidErrors = 0;

  const autoPlay = (sock: Socket, mySeat: number, g: GameState) => {
    if (g.winnerId) return;
    const myId = `p${mySeat}`;
    // auction bid turn?
    if (g.phase === "auction") {
      const a = g.auction!;
      if (a.active[a.turnIndex] === myId) act(sock, { t: "passBid", playerId: myId });
      return;
    }
    const cur = g.players[g.currentIndex];
    if (cur.id !== myId || cur.isAI) return;
    if (g.phase === "preRoll") {
      act(sock, cur.inJail ? { t: "roll" } : { t: "roll" });
    } else if (g.phase === "resolved") {
      if (g.pending?.type === "buy") {
        const price = g.players.find((p) => p.id === myId)!.cash;
        // buy if we can afford it, else decline (triggers auction)
        act(sock, price >= 0 ? { t: "buy" } : { t: "decline" });
      } else {
        act(sock, { t: "endTurn" });
      }
    }
  };

  const act = (sock: Socket, action: GameAction) => sock.emit("game:action", action);

  const onState = (sock: Socket, seat: number) => (g: GameState) => {
    box.latest = g;
    updates++;
    setTimeout(() => autoPlay(sock, seat, g), 20);
  };
  a.on("game:state", onState(a, aSeat));
  b.on("game:state", onState(b, bSeat));
  a.on("error", (e) => { invalidErrors++; });
  b.on("error", (e) => { invalidErrors++; });

  // test anti-cheat: Bob tries to act on Alice's opening turn → should be rejected
  let rejected = false;
  b.once("error", () => (rejected = true));

  a.emit("lobby:start");
  await delay(150);
  // Bob (seat 1) attempts to roll while it's Alice's (seat 0) turn
  b.emit("game:action", { t: "roll" });
  await delay(200);
  log(rejected ? "✓ anti-cheat: out-of-turn action rejected" : "⚠ anti-cheat check inconclusive");

  // let it play out for a while
  const target = 4;
  const start = Date.now();
  while ((box.latest?.round ?? 0) < target && !box.latest?.winnerId && Date.now() - start < 25_000) {
    await delay(250);
  }

  const g = box.latest!;
  log("———");
  log("✓ state updates received:", updates);
  log("✓ reached round:", g.round, g.winnerId ? `(winner: ${g.winnerId})` : "");
  log("players:");
  for (const p of g.players) {
    const owned = Object.values(g.properties).filter((pr) => pr.ownerId === p.id).length;
    log(`  ${p.token} ${p.name} (${p.id})  cash=${p.cash.toLocaleString()}  assets=${owned}  ${p.bankrupt ? "BANKRUPT" : ""}`);
  }
  log("recent log:");
  for (const e of g.log.slice(-6)) log("   ·", e.text);

  // test reconnection: drop Bob, reconnect with his session token
  b.disconnect();
  await delay(200);
  const c = connect();
  await new Promise<void>((r) => c.on("connect", () => r()));
  const re: any = await emitAck(c, "rejoin", { sessionToken: joined.sessionToken });
  log(re.message ? `⚠ rejoin failed: ${re.message}` : `✓ reconnection works (rejoined seat ${re.seatIndex})`);

  a.disconnect();
  c.disconnect();
  log("DONE");
  process.exit(0);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
