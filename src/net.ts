import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import type { AILevel, GameMode, GameState } from "./game/types";
import type { GameAction } from "./game/actions";
import { setGame, setMyId, setOnline, leaveGame } from "./store";

// Wire-protocol shapes (mirror server/src/protocol.ts).
export interface SeatView {
  index: number;
  playerId: string;
  displayName: string;
  isAI: boolean;
  aiLevel: AILevel;
  token: string;
  color: string;
  connected: boolean;
  isHost: boolean;
}
export interface LobbyView {
  roomId: string;
  code: string;
  name: string;
  isPrivate: boolean;
  mode: GameMode;
  maxRounds: number;
  started: boolean;
  seats: SeatView[];
  spectatorCount: number;
}
export interface PublicRoom {
  roomId: string;
  code: string;
  name: string;
  players: number;
  max: number;
  mode: GameMode;
}
interface Joined {
  roomId: string;
  code: string;
  sessionToken: string;
  seatIndex: number;
}

// In dev → local server. In prod → VITE_SERVER_URL (set on Netlify) if given,
// otherwise same-origin (works when the Node server also serves the client).
const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ||
  (import.meta.env.DEV ? "http://localhost:3001" : "");

export interface NetState {
  status: "disconnected" | "connecting" | "connected";
  lobby: LobbyView | null;
  rooms: PublicRoom[];
  error: string | null;
  joined: Joined | null;
  spectator: boolean;
  myPlayerId: string | null;
  turn: { deadline: number | null; actorId: string | null } | null;
}

let net: NetState = {
  status: "disconnected",
  lobby: null,
  rooms: [],
  error: null,
  joined: null,
  spectator: false,
  myPlayerId: null,
  turn: null,
};

const listeners = new Set<() => void>();
function set(patch: Partial<NetState>) {
  net = { ...net, ...patch };
  for (const l of listeners) l();
}
export function getNet(): NetState {
  return net;
}
export function useNet(): NetState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getNet,
    getNet
  );
}

let socket: Socket | null = null;

function sendAction(a: GameAction) {
  socket?.emit("game:action", a);
}

function ensureSocket(): Socket {
  if (socket) return socket;
  set({ status: "connecting" });
  socket = io(SERVER_URL, { transports: ["websocket", "polling"] });

  socket.on("connect", () => {
    set({ status: "connected" });
    // auto-rejoin after a reconnect
    if (net.joined?.sessionToken) {
      socket!.emit("rejoin", { sessionToken: net.joined.sessionToken }, (r: any) => {
        if (r && !r.message) set({ joined: r });
      });
    }
  });
  socket.on("disconnect", () => set({ status: "disconnected" }));
  socket.on("connect_error", () => set({ status: "disconnected", error: "Can't reach the server. Is it running on :3001?" }));

  socket.on("lobby:state", (lobby: LobbyView) => {
    set({ lobby });
    if (lobby.started) setOnline(sendAction, net.joined ? `p${net.joined.seatIndex}` : null);
  });
  socket.on("me", (p: { playerId: string }) => {
    setMyId(p.playerId);
    setOnline(sendAction, p.playerId);
    set({ myPlayerId: p.playerId });
  });
  socket.on("game:state", (g: GameState) => setGame(g));
  socket.on("kicked", () => {
    set({ lobby: null, joined: null, spectator: false, turn: null, myPlayerId: null, error: "The host left and the room was closed." });
    leaveGame();
  });
  socket.on("turn", (t: { deadline: number | null; actorId: string | null }) => set({ turn: t }));
  socket.on("error", (e: { message: string }) => {
    set({ error: e.message });
    setTimeout(() => set({ error: null }), 4000);
  });

  return socket;
}

function ack<T>(event: string, payload: any): Promise<T> {
  return new Promise((resolve) => ensureSocket().emit(event, payload, (r: T) => resolve(r)));
}

// ── public API ───────────────────────────────────────────────────────────
export async function createRoom(p: {
  displayName: string;
  name: string;
  isPrivate: boolean;
  mode: GameMode;
  maxRounds?: number;
}): Promise<boolean> {
  const r: any = await ack("lobby:create", p);
  if (r?.sessionToken) {
    set({ joined: r, spectator: false, error: null });
    return true;
  }
  set({ error: r?.message ?? "Could not create room." });
  return false;
}

export async function joinRoom(code: string, displayName: string): Promise<boolean> {
  const r: any = await ack("lobby:join", { code, displayName });
  if (r?.sessionToken) {
    set({ joined: r, spectator: false, error: null });
    return true;
  }
  set({ error: r?.message ?? "Could not join room." });
  return false;
}

export async function spectate(code: string): Promise<boolean> {
  const r: any = await ack("lobby:spectate", { code });
  if (r?.roomId) {
    set({ joined: null, spectator: true, error: null });
    return true;
  }
  set({ error: r?.message ?? "Could not spectate." });
  return false;
}

export async function refreshRooms() {
  const rooms: PublicRoom[] = await ack("lobby:list", undefined);
  set({ rooms: rooms ?? [] });
}

export function addAI(aiLevel: AILevel) {
  ensureSocket().emit("lobby:addAI", { aiLevel });
}
export function removeSeat(index: number) {
  ensureSocket().emit("lobby:removeSeat", { index });
}
export function setConfig(cfg: { mode?: GameMode; maxRounds?: number }) {
  ensureSocket().emit("lobby:config", cfg);
}
export function startOnlineGame() {
  ensureSocket().emit("lobby:start");
}

export function leaveRoom() {
  socket?.emit("lobby:leave");
  set({ lobby: null, joined: null, spectator: false, turn: null, myPlayerId: null });
  leaveGame();
}

/** Pre-connect so the public room browser can load. */
export function connect() {
  ensureSocket();
}
