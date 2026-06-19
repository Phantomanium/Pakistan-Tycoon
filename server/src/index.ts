import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, type Socket } from "socket.io";

import { requiredActor, runAction, type GameAction } from "../../src/game/actions";
import { auctionBidder, currentPlayer } from "../../src/game/engine";
import {
  aiAcceptTrade,
  aiAuctionMove,
  aiNextDevelopment,
  aiPreRoll,
  aiShouldBuy,
} from "../../src/game/ai";
import type { GameState } from "../../src/game/types";
import {
  addAI,
  allRooms,
  createRoom,
  deleteRoom,
  joinRoom,
  lobbyView,
  publicRooms,
  removeSeat,
  roomByCode,
  roomBySession,
  seatByPlayerId,
  seatBySession,
  startGame,
  sweepRooms,
  touch,
  type Room,
} from "./rooms";

const PORT = Number(process.env.PORT) || 3001;
const TURN_MS = 60_000;
const AI_DELAY = 750;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, methods: ["GET", "POST"] },
});

app.get("/health", (_req, res) => res.json({ ok: true, rooms: allRooms().length }));

// Optionally serve the built client (single-deploy mode).
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "../../dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(join(distDir, "index.html")));
}

// ── broadcast helpers ──────────────────────────────────────────────────────
function broadcastLobby(room: Room) {
  io.to(room.id).emit("lobby:state", lobbyView(room));
  // Tell each seated client which engine player id is theirs (indices can
  // shift while the host edits the lobby).
  for (const seat of room.seats) {
    if (seat.socketId && seat.connected) {
      io.to(seat.socketId).emit("me", { playerId: seat.playerId });
    }
  }
}
function broadcastGame(room: Room) {
  if (room.game) io.to(room.id).emit("game:state", room.game);
}
function emitTurn(room: Room, deadline: number | null, actorId: string | null) {
  io.to(room.id).emit("turn", { deadline, actorId });
}
function clearTimers(room: Room) {
  if (room.timers.auto) clearTimeout(room.timers.auto);
  if (room.timers.turn) clearTimeout(room.timers.turn);
  room.timers.auto = undefined;
  room.timers.turn = undefined;
}

// ── AI / timeout action selection ───────────────────────────────────────────
function aiActionFor(g: GameState): GameAction | null {
  if (g.phase === "auction") {
    const b = auctionBidder(g);
    if (!b?.isAI) return null;
    const mv = aiAuctionMove(g);
    return mv === "pass" ? { t: "passBid", playerId: b.id } : { t: "placeBid", playerId: b.id, amount: mv.bid };
  }
  if (g.trade?.status === "open") {
    const to = g.players.find((p) => p.id === g.trade!.toId);
    if (!to?.isAI) return null;
    return { t: "respondTrade", accept: aiAcceptTrade(g, g.trade) };
  }
  const cur = currentPlayer(g);
  if (!cur.isAI) return null;
  if (g.phase === "preRoll") {
    const d = aiPreRoll(g);
    return d === "pay" ? { t: "payJail" } : d === "card" ? { t: "useJailCard" } : { t: "roll" };
  }
  if (g.phase === "resolved") {
    if (g.pending?.type === "buy") return aiShouldBuy(g) ? { t: "buy" } : { t: "decline" };
    const dev = aiNextDevelopment(g);
    return dev != null ? { t: "develop", pos: dev } : { t: "endTurn" };
  }
  return null;
}

function defaultActionFor(g: GameState): GameAction | null {
  if (g.phase === "auction") {
    const b = auctionBidder(g);
    return b ? { t: "passBid", playerId: b.id } : null;
  }
  if (g.trade?.status === "open") return { t: "respondTrade", accept: false };
  if (g.phase === "preRoll") return { t: "roll" };
  if (g.phase === "resolved") return g.pending?.type === "buy" ? { t: "decline" } : { t: "endTurn" };
  return null;
}

function applyServerAction(room: Room, action: GameAction) {
  const g = room.game;
  if (!g) return;
  const next = runAction(g, action);
  if (next !== g) {
    room.game = next;
    broadcastGame(room);
  }
  scheduleNext(room);
}

function stepAI(room: Room) {
  if (!room.game) return;
  const action = aiActionFor(room.game);
  if (!action) {
    scheduleNext(room);
    return;
  }
  applyServerAction(room, action);
}

function autoDefault(room: Room) {
  if (!room.game) return;
  const action = defaultActionFor(room.game);
  if (!action) return;
  applyServerAction(room, action);
}

function scheduleNext(room: Room) {
  clearTimers(room);
  const g = room.game;
  if (!g || g.winnerId) {
    room.timers.turnDeadline = null;
    room.timers.turnActorId = null;
    emitTurn(room, null, null);
    return;
  }
  let actorId: string | undefined;
  if (g.phase === "auction") actorId = auctionBidder(g)?.id;
  else if (g.trade?.status === "open") actorId = g.trade.toId;
  else actorId = currentPlayer(g).id;
  if (!actorId) return;

  const seat = seatByPlayerId(room, actorId);
  if (seat?.isAI) {
    room.timers.turnDeadline = null;
    room.timers.turnActorId = actorId;
    emitTurn(room, null, actorId);
    room.timers.auto = setTimeout(() => stepAI(room), AI_DELAY);
  } else {
    const deadline = Date.now() + TURN_MS;
    room.timers.turnDeadline = deadline;
    room.timers.turnActorId = actorId;
    emitTurn(room, deadline, actorId);
    room.timers.turn = setTimeout(() => autoDefault(room), TURN_MS);
  }
}

// ── socket handlers ──────────────────────────────────────────────────────
type Ack<T> = (r: T) => void;

io.on("connection", (socket: Socket) => {
  socket.on("lobby:create", (p: any, ack: Ack<any>) => {
    const { room, sessionToken } = createRoom({
      displayName: p?.displayName,
      name: p?.name,
      isPrivate: !!p?.isPrivate,
      mode: p?.mode ?? "classic",
      maxRounds: p?.maxRounds,
      socketId: socket.id,
    });
    socket.data.roomId = room.id;
    socket.data.sessionToken = sessionToken;
    socket.join(room.id);
    ack?.({ roomId: room.id, code: room.code, sessionToken, seatIndex: 0 });
    broadcastLobby(room);
  });

  socket.on("lobby:join", (p: any, ack: Ack<any>) => {
    const res = joinRoom({ code: p?.code ?? "", displayName: p?.displayName, socketId: socket.id });
    if ("error" in res) {
      ack?.({ message: res.error });
      return;
    }
    socket.data.roomId = res.room.id;
    socket.data.sessionToken = res.sessionToken;
    socket.join(res.room.id);
    ack?.({ roomId: res.room.id, code: res.room.code, sessionToken: res.sessionToken, seatIndex: res.seatIndex });
    broadcastLobby(res.room);
  });

  socket.on("lobby:spectate", (p: any, ack: Ack<any>) => {
    const room = roomByCode(p?.code ?? "");
    if (!room) {
      ack?.({ message: "Room not found." });
      return;
    }
    room.spectators.add(socket.id);
    socket.data.roomId = room.id;
    socket.join(room.id);
    ack?.({ roomId: room.id, code: room.code });
    socket.emit("lobby:state", lobbyView(room));
    if (room.game) socket.emit("game:state", room.game);
    broadcastLobby(room);
  });

  socket.on("lobby:list", (_p: any, ack: Ack<any>) => {
    const cb = typeof _p === "function" ? _p : ack;
    cb?.(publicRooms());
  });

  socket.on("rejoin", (p: any, ack: Ack<any>) => {
    const room = roomBySession(p?.sessionToken);
    const seat = room ? seatBySession(room, p?.sessionToken) : undefined;
    if (!room || !seat) {
      ack?.({ message: "Session expired — please rejoin." });
      return;
    }
    seat.connected = true;
    seat.socketId = socket.id;
    socket.data.roomId = room.id;
    socket.data.sessionToken = p.sessionToken;
    socket.join(room.id);
    ack?.({ roomId: room.id, code: room.code, sessionToken: p.sessionToken, seatIndex: room.seats.indexOf(seat) });
    broadcastLobby(room);
    if (room.game) {
      socket.emit("game:state", room.game);
      socket.emit("turn", { deadline: room.timers.turnDeadline, actorId: room.timers.turnActorId });
    }
  });

  function hostRoom(): Room | undefined {
    const room = roomBySession(socket.data.sessionToken);
    if (!room || room.hostToken !== socket.data.sessionToken) return undefined;
    return room;
  }

  socket.on("lobby:addAI", (p: any) => {
    const room = hostRoom();
    if (room && addAI(room, p?.aiLevel ?? "normal")) broadcastLobby(room);
  });

  socket.on("lobby:removeSeat", (p: any) => {
    const room = hostRoom();
    if (room && removeSeat(room, Number(p?.index))) broadcastLobby(room);
  });

  socket.on("lobby:config", (p: any) => {
    const room = hostRoom();
    if (!room || room.started) return;
    if (p?.mode) room.mode = p.mode;
    if (p?.maxRounds) room.maxRounds = Math.max(5, Math.min(60, Number(p.maxRounds)));
    touch(room);
    broadcastLobby(room);
  });

  socket.on("lobby:start", () => {
    const room = hostRoom();
    if (!room) return;
    if (startGame(room)) {
      broadcastLobby(room);
      broadcastGame(room);
      scheduleNext(room);
    } else {
      socket.emit("error", { message: "Need at least 2 players to start." });
    }
  });

  socket.on("game:action", (action: GameAction) => {
    const room = roomBySession(socket.data.sessionToken);
    if (!room || !room.game) return;
    const seat = seatBySession(room, socket.data.sessionToken);
    if (!seat) {
      socket.emit("error", { message: "Spectators cannot act." });
      return;
    }
    const required = requiredActor(room.game, action);
    if (required === null) {
      socket.emit("error", { message: "That action isn't available right now." });
      return;
    }
    if (required !== seat.playerId) {
      socket.emit("error", { message: "It's not your turn." });
      return;
    }
    if ((action.t === "placeBid" || action.t === "passBid") && action.playerId !== seat.playerId) return;
    if (action.t === "proposeTrade" && action.proposal.fromId !== seat.playerId) return;
    touch(room);
    applyServerAction(room, action);
  });

  socket.on("lobby:leave", () => {
    const room = roomBySession(socket.data.sessionToken);
    if (room) {
      const idx = room.seats.findIndex((s) => s.sessionToken === socket.data.sessionToken);
      if (idx >= 0) {
        if (!room.started) {
          if (room.seats[idx].sessionToken === room.hostToken) {
            io.to(room.id).emit("kicked"); // host abandoned the room
            clearTimers(room);
            deleteRoom(room);
          } else if (removeSeat(room, idx)) {
            broadcastLobby(room);
          }
        } else {
          room.seats[idx].connected = false;
          room.seats[idx].socketId = null;
          broadcastLobby(room);
        }
      }
      socket.leave(room.id);
    }
    for (const r of allRooms()) {
      if (r.spectators.delete(socket.id)) {
        socket.leave(r.id);
        broadcastLobby(r);
      }
    }
    socket.data.roomId = undefined;
    socket.data.sessionToken = undefined;
  });

  socket.on("disconnect", () => {
    const room = roomBySession(socket.data.sessionToken);
    if (room) {
      const seat = seatBySession(room, socket.data.sessionToken);
      if (seat) {
        seat.connected = false;
        seat.socketId = null;
        touch(room);
        broadcastLobby(room);
      }
    }
    for (const r of allRooms()) {
      if (r.spectators.delete(socket.id)) broadcastLobby(r);
    }
  });
});

setInterval(sweepRooms, 60_000);

httpServer.listen(PORT, () => {
  console.log(`🏙️  Pakistan Tycoon server listening on http://localhost:${PORT}`);
});
