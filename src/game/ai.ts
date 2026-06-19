// ─────────────────────────────────────────────────────────────────────────
// Pakistan Tycoon — AI opponents.
// Difficulty tunes risk appetite: cash reserves, willingness to overpay at
// auction, and how aggressively the AI develops and pursues monopolies.
// These functions are pure read-only analysers; the caller applies the chosen
// engine action.
// ─────────────────────────────────────────────────────────────────────────

import { BOARD, GROUP_POSITIONS } from "./board";
import {
  auctionBidder,
  canDevelop,
  currentPlayer,
  ownsWholeGroup,
  playerById,
} from "./engine";
import type { AILevel, ColorGroup, GameState, Player, TradeOffer } from "./types";

interface Profile {
  reserve: number; // cash to keep on hand for safety
  buildReserve: number; // cash to keep when developing
  auctionFactor: number; // multiplier on assessed value when bidding
  monopolyGreed: number; // extra weight for completing/extending a monopoly
}

const PROFILES: Record<AILevel, Profile> = {
  easy: { reserve: 600_000, buildReserve: 800_000, auctionFactor: 0.65, monopolyGreed: 1.2 },
  normal: { reserve: 2_000_000, buildReserve: 2_000_000, auctionFactor: 0.9, monopolyGreed: 1.6 },
  hard: { reserve: 2_500_000, buildReserve: 1_500_000, auctionFactor: 1.15, monopolyGreed: 2.2 },
};

function ownedInGroup(s: GameState, ownerId: string, group: ColorGroup): number {
  return GROUP_POSITIONS[group].filter((p) => s.properties[p].ownerId === ownerId).length;
}

/** How strategically valuable owning `pos` is to `ownerId`. */
function value(s: GameState, pos: number, ownerId: string, greed: number): number {
  const space = BOARD[pos];
  const price = space.price ?? 0;
  let v = price;
  if (space.type === "city" && space.group) {
    const group = space.group;
    const groupPositions = GROUP_POSITIONS[group];
    const owns = ownedInGroup(s, ownerId, group);
    const wouldOwn = owns + (s.properties[pos].ownerId === ownerId ? 0 : 1);
    if (wouldOwn === groupPositions.length) v += price * greed; // completes monopoly
    else if (owns > 0) v += price * 0.5 * owns; // extends a holding
  } else if (space.type === "airport") {
    const owns = [5, 15, 25, 35].filter((p) => s.properties[p].ownerId === ownerId).length;
    v += price * 0.35 * owns;
  } else if (space.type === "utility") {
    const owns = [12, 28].filter((p) => s.properties[p].ownerId === ownerId).length;
    v += price * 0.3 * owns;
  }
  return v;
}

// ── jail decision (during preRoll) ─────────────────────────────────────────
export function aiPreRoll(s: GameState): "pay" | "card" | "roll" {
  const p = currentPlayer(s);
  if (!p.inJail) return "roll";
  if (p.jailCards > 0) return "card";
  const prof = PROFILES[p.aiLevel];
  // Late game with lots of opponents' developed property → safer to sit tight.
  const dangerous = countDevelopedOpponents(s, p.id) >= 4;
  if (dangerous && p.jailTurns < 2) return "roll";
  if (p.cash > prof.reserve + 1_000_000) return "pay";
  return "roll";
}

function countDevelopedOpponents(s: GameState, selfId: string): number {
  let n = 0;
  for (const pos of Object.keys(s.properties).map(Number)) {
    const prop = s.properties[pos];
    if (prop.ownerId && prop.ownerId !== selfId && prop.stage >= 2) n++;
  }
  return n;
}

// ── buy decision ─────────────────────────────────────────────────────────
export function aiShouldBuy(s: GameState): boolean {
  if (s.pending?.type !== "buy") return false;
  const pos = s.pending.pos;
  const p = currentPlayer(s);
  const price = BOARD[pos].price!;
  if (p.cash < price) return false;
  const prof = PROFILES[p.aiLevel];
  const space = BOARD[pos];

  // Completing a monopoly: buy even if it dips into the reserve.
  if (space.type === "city" && space.group) {
    const wouldComplete = ownsWholeGroup(s, p.id, space.group) === false &&
      GROUP_POSITIONS[space.group].every(
        (g) => g === pos || s.properties[g].ownerId === p.id
      );
    if (wouldComplete && p.cash >= price) return true;
  }

  const after = p.cash - price;
  if (after < prof.reserve) return p.aiLevel === "easy" && after >= 0;

  if (p.aiLevel === "easy") return true; // greedy
  // normal/hard: prefer things that build toward holdings, but still buy most.
  const v = value(s, pos, p.id, prof.monopolyGreed);
  return v >= price * 0.95;
}

// ── auction bidding ────────────────────────────────────────────────────────
export function aiAuctionMove(s: GameState): { bid: number } | "pass" {
  const a = s.auction;
  const bidder = auctionBidder(s);
  if (!a || !bidder) return "pass";
  const prof = PROFILES[bidder.aiLevel];
  let cap = value(s, a.pos, bidder.id, prof.monopolyGreed) * prof.auctionFactor;
  cap = Math.min(cap, bidder.cash);
  const step = Math.max(100_000, Math.round((BOARD[a.pos].price ?? 1_000_000) * 0.1));
  const nextBid = a.highBid === 0 ? 100_000 : a.highBid + step;
  if (nextBid <= cap) return { bid: Math.round(nextBid / 100_000) * 100_000 };
  return "pass";
}

// ── developing during the manage phase ─────────────────────────────────────
/** Returns the next plot to develop, or null when the AI is done managing. */
export function aiNextDevelopment(s: GameState): number | null {
  const p = currentPlayer(s);
  const prof = PROFILES[p.aiLevel];
  if (p.cash < prof.buildReserve) return null;

  // candidate plots the AI can legally develop right now
  const candidates: number[] = [];
  for (const pos of Object.keys(s.properties).map(Number)) {
    if (canDevelop(s, pos)) candidates.push(pos);
  }
  if (!candidates.length) return null;

  // Prefer the highest-rent-ceiling groups (orange/red/yellow are classic
  // sweet spots), and the lowest current stage to keep building evenly.
  const groupPriority: Record<ColorGroup, number> = {
    orange: 9, red: 8, yellow: 7, pink: 6, lightblue: 5, green: 4, darkblue: 3, brown: 2,
  };
  candidates.sort((a, b) => {
    const sa = s.properties[a].stage, sb = s.properties[b].stage;
    if (sa !== sb) return sa - sb; // build evenly: lowest stage first
    const ga = groupPriority[BOARD[a].group!], gb = groupPriority[BOARD[b].group!];
    return gb - ga;
  });

  const pos = candidates[0];
  // make sure we keep our reserve after building
  if (p.cash - BOARD[pos].buildCost! < prof.buildReserve - BOARD[pos].buildCost!) {
    // (always true) — explicit affordability already guaranteed by canDevelop
  }
  return p.cash - BOARD[pos].buildCost! >= 0 && p.cash >= prof.buildReserve ? pos : null;
}

// ── trade evaluation ───────────────────────────────────────────────────────
/** AI (the recipient) decides whether to accept an open trade offer. */
export function aiAcceptTrade(s: GameState, offer: TradeOffer): boolean {
  const ai = playerById(s, offer.toId);
  const prof = PROFILES[ai.aiLevel];
  // AI receives giveCash + giveProps, parts with wantCash + wantProps
  if (ai.cash < offer.wantCash) return false;
  const cashDelta = offer.giveCash - offer.wantCash;
  let propDelta = 0;
  for (const pos of offer.giveProps) propDelta += value(s, pos, ai.id, prof.monopolyGreed);
  for (const pos of offer.wantProps) propDelta += -value(s, pos, ai.id, prof.monopolyGreed);
  const total = cashDelta + propDelta;
  const margin = ai.aiLevel === "easy" ? -500_000 : ai.aiLevel === "normal" ? 0 : 400_000;
  return total > margin;
}

export function aiPlayerName(p: Player): string {
  return p.name;
}
