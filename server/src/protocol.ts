// Wire protocol shared between server and client.
import type { AILevel, GameMode } from "../../src/game/types";

export interface SeatView {
  index: number;
  playerId: string; // p0..pn (matches engine player id once started)
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

export interface JoinedPayload {
  roomId: string;
  code: string;
  sessionToken: string;
  seatIndex: number;
}

export interface TurnTimer {
  /** epoch ms when the current human actor will be auto-actioned, or null. */
  deadline: number | null;
  actorId: string | null;
}

export interface ErrorPayload {
  message: string;
}
