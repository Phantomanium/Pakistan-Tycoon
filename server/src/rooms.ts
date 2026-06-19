import { randomBytes, randomUUID } from "node:crypto";
import { COLORS, TOKENS, createGame, type PlayerConfig } from "../../src/game/engine";
import type { AILevel, GameMode, GameState } from "../../src/game/types";
import type { LobbyView, PublicRoom, SeatView } from "./protocol";

export const MAX_SEATS = 6;
export const MIN_SEATS = 2;

export interface Seat {
  displayName: string;
  isAI: boolean;
  aiLevel: AILevel;
  token: string;
  color: string;
  sessionToken: string | null; // null for AI seats
  socketId: string | null;
  connected: boolean;
  playerId: string; // p<index>, assigned/kept stable once the game starts
}

export interface Room {
  id: string;
  code: string;
  name: string;
  isPrivate: boolean;
  hostToken: string;
  mode: GameMode;
  maxRounds: number;
  seats: Seat[];
  spectators: Set<string>; // socket ids
  game: GameState | null;
  started: boolean;
  lastActive: number;
  timers: { auto?: NodeJS.Timeout; turn?: NodeJS.Timeout; turnDeadline: number | null; turnActorId: string | null };
}

const rooms = new Map<string, Room>();
const codeToRoom = new Map<string, string>();
const sessionToRoom = new Map<string, string>(); // sessionToken -> roomId

function genCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    const bytes = randomBytes(6);
    code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  } while (codeToRoom.has(code));
  return code;
}

export function touch(room: Room) {
  room.lastActive = Date.now();
}

function makeSeat(displayName: string, index: number, opts: Partial<Seat> = {}): Seat {
  return {
    displayName,
    isAI: false,
    aiLevel: "normal",
    token: TOKENS[index % TOKENS.length],
    color: COLORS[index % COLORS.length],
    sessionToken: null,
    socketId: null,
    connected: false,
    playerId: `p${index}`,
    ...opts,
  };
}

export function createRoom(opts: {
  displayName: string;
  name: string;
  isPrivate: boolean;
  mode: GameMode;
  maxRounds?: number;
  socketId: string;
}): { room: Room; sessionToken: string } {
  const id = randomUUID();
  const code = genCode();
  const sessionToken = randomUUID();
  const host = makeSeat(opts.displayName || "Host", 0, {
    sessionToken,
    socketId: opts.socketId,
    connected: true,
  });
  const room: Room = {
    id,
    code,
    name: opts.name?.trim() || `${opts.displayName || "Host"}'s game`,
    isPrivate: opts.isPrivate,
    hostToken: sessionToken,
    mode: opts.mode,
    maxRounds: opts.maxRounds ?? (opts.mode === "quick" ? 12 : 30),
    seats: [host],
    spectators: new Set(),
    game: null,
    started: false,
    lastActive: Date.now(),
    timers: { turnDeadline: null, turnActorId: null },
  };
  rooms.set(id, room);
  codeToRoom.set(code, id);
  sessionToRoom.set(sessionToken, id);
  return { room, sessionToken };
}

export function joinRoom(opts: {
  code: string;
  displayName: string;
  socketId: string;
}): { room: Room; sessionToken: string; seatIndex: number } | { error: string } {
  const roomId = codeToRoom.get(opts.code.toUpperCase().trim());
  const room = roomId ? rooms.get(roomId) : undefined;
  if (!room) return { error: "Room not found. Check the invite code." };
  if (room.started) return { error: "That game has already started." };
  if (room.seats.length >= MAX_SEATS) return { error: "Room is full." };
  const index = room.seats.length;
  const sessionToken = randomUUID();
  const seat = makeSeat(opts.displayName || `Player ${index + 1}`, index, {
    sessionToken,
    socketId: opts.socketId,
    connected: true,
  });
  room.seats.push(seat);
  sessionToRoom.set(sessionToken, room.id);
  touch(room);
  return { room, sessionToken, seatIndex: index };
}

export function addAI(room: Room, aiLevel: AILevel): boolean {
  if (room.started || room.seats.length >= MAX_SEATS) return false;
  const index = room.seats.length;
  const aiNames = ["Babar", "Ayesha", "Imran", "Sana", "Bilal", "Zara"];
  room.seats.push(
    makeSeat(`${aiNames[index % aiNames.length]} (AI)`, index, { isAI: true, aiLevel, connected: true })
  );
  touch(room);
  return true;
}

export function removeSeat(room: Room, index: number): boolean {
  if (room.started || index <= 0 || index >= room.seats.length) return false; // can't remove host (0)
  const [removed] = room.seats.splice(index, 1);
  if (removed.sessionToken) sessionToRoom.delete(removed.sessionToken);
  // reindex playerIds / default tokens
  room.seats.forEach((s, i) => {
    s.playerId = `p${i}`;
  });
  touch(room);
  return true;
}

export function startGame(room: Room): boolean {
  if (room.started || room.seats.length < MIN_SEATS) return false;
  room.seats.forEach((s, i) => (s.playerId = `p${i}`));
  const players: PlayerConfig[] = room.seats.map((s) => ({
    name: s.displayName,
    isAI: s.isAI,
    aiLevel: s.aiLevel,
    token: s.token,
    color: s.color,
  }));
  room.game = createGame({ players, mode: room.mode, maxRounds: room.mode === "timed" ? room.maxRounds : undefined });
  room.started = true;
  touch(room);
  return true;
}

export function roomById(id: string | undefined): Room | undefined {
  return id ? rooms.get(id) : undefined;
}

export function roomByCode(code: string): Room | undefined {
  return roomById(codeToRoom.get(code.toUpperCase().trim()));
}

export function roomBySession(sessionToken: string | undefined): Room | undefined {
  if (!sessionToken) return undefined;
  return roomById(sessionToRoom.get(sessionToken));
}

export function seatBySession(room: Room, sessionToken: string | undefined): Seat | undefined {
  if (!sessionToken) return undefined;
  return room.seats.find((s) => s.sessionToken === sessionToken);
}

export function seatByPlayerId(room: Room, playerId: string): Seat | undefined {
  return room.seats.find((s) => s.playerId === playerId);
}

export function publicRooms(): PublicRoom[] {
  const list: PublicRoom[] = [];
  for (const room of rooms.values()) {
    if (room.isPrivate || room.started) continue;
    list.push({
      roomId: room.id,
      code: room.code,
      name: room.name,
      players: room.seats.length,
      max: MAX_SEATS,
      mode: room.mode,
    });
  }
  return list.slice(0, 50);
}

export function lobbyView(room: Room): LobbyView {
  const seats: SeatView[] = room.seats.map((s, i) => ({
    index: i,
    playerId: s.playerId,
    displayName: s.displayName,
    isAI: s.isAI,
    aiLevel: s.aiLevel,
    token: s.token,
    color: s.color,
    connected: s.connected,
    isHost: s.sessionToken === room.hostToken,
  }));
  return {
    roomId: room.id,
    code: room.code,
    name: room.name,
    isPrivate: room.isPrivate,
    mode: room.mode,
    maxRounds: room.maxRounds,
    started: room.started,
    seats,
    spectatorCount: room.spectators.size,
  };
}

export function deleteRoom(room: Room) {
  for (const s of room.seats) if (s.sessionToken) sessionToRoom.delete(s.sessionToken);
  codeToRoom.delete(room.code);
  rooms.delete(room.id);
}

/** Periodic cleanup: drop rooms with no connected humans / spectators. */
export function sweepRooms() {
  const now = Date.now();
  for (const room of rooms.values()) {
    const liveHumans = room.seats.some((s) => !s.isAI && s.connected);
    const idleMs = now - room.lastActive;
    if (!liveHumans && room.spectators.size === 0 && idleMs > 5 * 60_000) {
      deleteRoom(room);
    }
  }
}

export function allRooms(): Room[] {
  return [...rooms.values()];
}
