import { useSyncExternalStore } from "react";
import type { GameState } from "./game/types";
import { runAction, type GameAction } from "./game/actions";

// Single game-state store shared by local and online play.
//  • Local:  send(action) runs the pure engine immediately.
//  • Online: send(action) is emitted to the server, which validates, applies
//            the same engine action, and broadcasts the new state back.
// The server is registered via setOnline(); going local clears it.

let state: GameState | null = null;
let online = false;
let myId: string | null = null;
let emitFn: ((a: GameAction) => void) | null = null;

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

export function getState(): GameState | null {
  return state;
}
export function getMyId(): string | null {
  return myId;
}
export function isOnline(): boolean {
  return online;
}

export function setGame(next: GameState | null) {
  state = next;
  emit();
}

/** Begin a local (offline) game vs AI / hot-seat. */
export function startLocalGame(game: GameState) {
  online = false;
  myId = null;
  emitFn = null;
  setGame(game);
}

/** Register the online transport (called by the net layer on game start). */
export function setOnline(emitAction: (a: GameAction) => void, playerId: string | null) {
  online = true;
  myId = playerId;
  emitFn = emitAction;
  emit();
}

export function setMyId(playerId: string | null) {
  myId = playerId;
  emit();
}

/** Dispatch an intent through whichever transport is active. */
export function send(a: GameAction) {
  if (online) {
    emitFn?.(a);
  } else if (state) {
    state = runAction(state, a);
    emit();
  }
}

/** Return to the main menu / tear down the current game. */
export function leaveGame() {
  state = null;
  online = false;
  myId = null;
  emitFn = null;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useGame(): GameState | null {
  return useSyncExternalStore(subscribe, getState, getState);
}
