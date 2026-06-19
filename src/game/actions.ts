// ─────────────────────────────────────────────────────────────────────────
// Pakistan Tycoon — serializable action layer.
// A GameAction is a plain JSON object describing an intent. `runAction` maps
// it onto the pure engine. The SAME function runs on the client (local play)
// and on the server (authoritative multiplayer), so behaviour is identical and
// the server can validate by simply re-running the engine.
// ─────────────────────────────────────────────────────────────────────────

import * as E from "./engine";
import type { GameState, TradeProposal } from "./types";

export type GameAction =
  | { t: "roll" }
  | { t: "buy" }
  | { t: "decline" }
  | { t: "endTurn" }
  | { t: "payJail" }
  | { t: "useJailCard" }
  | { t: "develop"; pos: number }
  | { t: "sellDev"; pos: number }
  | { t: "mortgage"; pos: number }
  | { t: "unmortgage"; pos: number }
  | { t: "placeBid"; playerId: string; amount: number }
  | { t: "passBid"; playerId: string }
  | { t: "proposeTrade"; proposal: TradeProposal }
  | { t: "respondTrade"; accept: boolean };

export function runAction(s: GameState, a: GameAction): GameState {
  switch (a.t) {
    case "roll":
      return E.rollDice(s);
    case "buy":
      return E.buyProperty(s);
    case "decline":
      return E.declineBuy(s);
    case "endTurn":
      return E.endTurn(s);
    case "payJail":
      return E.payJailFine(s);
    case "useJailCard":
      return E.useJailCard(s);
    case "develop":
      return E.develop(s, a.pos);
    case "sellDev":
      return E.sellDevelopment(s, a.pos);
    case "mortgage":
      return E.mortgage(s, a.pos);
    case "unmortgage":
      return E.unmortgage(s, a.pos);
    case "placeBid":
      return E.placeBid(s, a.playerId, a.amount);
    case "passBid":
      return E.passBid(s, a.playerId);
    case "proposeTrade":
      return E.proposeTrade(s, a.proposal);
    case "respondTrade":
      return E.respondTrade(s, a.accept);
  }
}

/**
 * Which player must be the actor for an action to be legal right now.
 * Returns the required playerId, or null if the action is currently invalid.
 * The server uses this to authorise socket messages (anti-cheat).
 */
export function requiredActor(s: GameState, a: GameAction): string | null {
  if (s.winnerId) return null;
  switch (a.t) {
    case "placeBid":
    case "passBid": {
      const bidder = E.auctionBidder(s);
      if (!bidder || s.phase !== "auction") return null;
      return bidder.id;
    }
    case "respondTrade": {
      if (!s.trade || s.trade.status !== "open") return null;
      return s.trade.toId;
    }
    case "proposeTrade":
      // proposer must be the player currently on turn (caller also checks
      // that the socket's seat matches proposal.fromId)
      if (s.phase === "auction") return null;
      return E.currentPlayer(s).id;
    default:
      // turn actions: must be the current player
      return E.currentPlayer(s).id;
  }
}
