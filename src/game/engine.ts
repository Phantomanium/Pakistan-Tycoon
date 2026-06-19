// ─────────────────────────────────────────────────────────────────────────
// Pakistan Tycoon — pure game engine.
// Every exported action takes a GameState and returns a NEW GameState (the
// input is never mutated). Randomness is driven by a seeded RNG stored inside
// the state, so a game is fully reproducible and could be replayed / validated
// server-side for anti-cheat in the multiplayer phase.
// ─────────────────────────────────────────────────────────────────────────

import {
  AIRPORT_BASE_RENT,
  AIRPORT_POSITIONS,
  BOARD,
  GO_SALARY,
  GROUP_POSITIONS,
  JAIL_FINE,
  STARTING_CASH,
  UTILITY_POSITIONS,
  UTILITY_RENT_UNIT,
  OWNABLE_POSITIONS,
} from "./board";
import { AWAMI, QISMAT } from "./cards";
import { NATIONAL_EVENTS } from "./events";
import type {
  AILevel,
  Card,
  ColorGroup,
  GameMode,
  GameState,
  LogEntry,
  Player,
  PropertyState,
  Stage,
  TradeProposal,
} from "./types";

const JAIL_POS = 10;
export const TOKENS = ["🚚", "🕌", "🛺", "🏏", "🦅", "⭐"];
export const COLORS = ["#159b5a", "#d23b3b", "#e8843c", "#5bb6d6", "#d6589f", "#e8c33c"];

// ── RNG (mulberry32) ───────────────────────────────────────────────────────
function rand(s: GameState): number {
  s.rngState = (s.rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rngState ^ (s.rngState >>> 15), 1 | s.rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const die = (s: GameState): number => Math.floor(rand(s) * 6) + 1;

function shuffled(n: number, s: GameState): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const clone = (s: GameState): GameState => structuredClone(s);

// ── small helpers ────────────────────────────────────────────────────────
export const currentPlayer = (s: GameState): Player => s.players[s.currentIndex];
export const playerById = (s: GameState, id: string): Player =>
  s.players.find((p) => p.id === id)!;
export const propAt = (s: GameState, pos: number): PropertyState | undefined => s.properties[pos];
export const activePlayers = (s: GameState): Player[] => s.players.filter((p) => !p.bankrupt);

function log(s: GameState, kind: LogEntry["kind"], text: string) {
  s.log.push({ id: s.logCounter++, kind, text });
  if (s.log.length > 200) s.log.shift();
}

export function ownsWholeGroup(s: GameState, ownerId: string, group: ColorGroup): boolean {
  return GROUP_POSITIONS[group].every((pos) => s.properties[pos].ownerId === ownerId);
}

function countOwned(s: GameState, ownerId: string, positions: number[], unmortgagedOnly: boolean): number {
  return positions.filter(
    (p) => s.properties[p].ownerId === ownerId && (!unmortgagedOnly || !s.properties[p].mortgaged)
  ).length;
}

/** Combined rent multiplier from active national-event modifiers for a space. */
function modifierFor(s: GameState, pos: number): number {
  const space = BOARD[pos];
  let m = 1;
  for (const mod of s.modifiers) {
    if (mod.globalRent) m *= mod.globalRent;
    if (space.type === "city" && space.group && mod.groupRent?.[space.group])
      m *= mod.groupRent[space.group]!;
    if (space.type === "airport" && mod.airportRent) m *= mod.airportRent;
    if (space.type === "utility" && mod.utilityRent) m *= mod.utilityRent;
  }
  return m;
}

/** How much rent landing on `pos` costs right now (0 if unowned/own/mortgaged). */
export function computeRent(
  s: GameState,
  pos: number,
  diceSum: number,
  opts: { airportMult?: number; utilityForce10?: boolean } = {}
): number {
  const space = BOARD[pos];
  const prop = s.properties[pos];
  if (!prop || !prop.ownerId || prop.mortgaged) return 0;
  const ownerId = prop.ownerId;
  let rent = 0;
  if (space.type === "city") {
    const base = space.rent![prop.stage];
    if (prop.stage === 0 && ownsWholeGroup(s, ownerId, space.group!)) {
      rent = base * 2; // monopoly on undeveloped group doubles base rent
    } else {
      rent = base;
    }
  } else if (space.type === "airport") {
    const n = countOwned(s, ownerId, AIRPORT_POSITIONS, true);
    rent = AIRPORT_BASE_RENT * Math.pow(2, Math.max(0, n - 1));
    if (opts.airportMult) rent *= opts.airportMult;
  } else if (space.type === "utility") {
    if (opts.utilityForce10) {
      rent = diceSum * 10 * UTILITY_RENT_UNIT;
    } else {
      const n = countOwned(s, ownerId, UTILITY_POSITIONS, true);
      rent = diceSum * (n >= 2 ? 10 : 4) * UTILITY_RENT_UNIT;
    }
  }
  return Math.round(rent * modifierFor(s, pos));
}

export function netWorth(s: GameState, p: Player): number {
  let total = p.cash;
  for (const pos of OWNABLE_POSITIONS) {
    const prop = s.properties[pos];
    if (prop.ownerId !== p.id) continue;
    const space = BOARD[pos];
    total += prop.mortgaged ? space.mortgage! : space.price!;
    if (space.type === "city") total += prop.stage * space.buildCost!;
  }
  return total;
}

// ── game creation ──────────────────────────────────────────────────────────
export interface PlayerConfig {
  name: string;
  isAI: boolean;
  aiLevel?: AILevel;
  token?: string;
  color?: string;
}

export function createGame(opts: {
  players: PlayerConfig[];
  mode: GameMode;
  maxRounds?: number;
  seed?: number;
}): GameState {
  const seed = opts.seed ?? (Math.floor(Math.random() * 0x7fffffff) | 0);
  const startCash = opts.mode === "quick" ? Math.round(STARTING_CASH * 0.8) : STARTING_CASH;

  const players: Player[] = opts.players.map((c, i) => ({
    id: `p${i}`,
    name: c.name,
    token: c.token ?? TOKENS[i % TOKENS.length],
    color: c.color ?? COLORS[i % COLORS.length],
    isAI: c.isAI,
    aiLevel: c.aiLevel ?? "normal",
    cash: startCash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    bankrupt: false,
  }));

  const properties: Record<number, PropertyState> = {};
  for (const pos of OWNABLE_POSITIONS) {
    properties[pos] = { ownerId: null, stage: 0, mortgaged: false };
  }

  const s: GameState = {
    mode: opts.mode,
    maxRounds: opts.maxRounds ?? (opts.mode === "quick" ? 12 : 30),
    players,
    properties,
    currentIndex: 0,
    phase: "preRoll",
    dice: null,
    doublesCount: 0,
    round: 1,
    turnCount: 0,
    pending: null,
    auction: null,
    trade: null,
    modifiers: [],
    log: [],
    qismatOrder: [],
    qismatPos: 0,
    awamiOrder: [],
    awamiPos: 0,
    rngState: seed,
    logCounter: 1,
    winnerId: null,
    freeParkingPot: 0,
  };
  s.qismatOrder = shuffled(QISMAT.length, s);
  s.awamiOrder = shuffled(AWAMI.length, s);
  log(s, "info", `New ${opts.mode} game — ${players.length} investors, each starting with Rs. ${startCash.toLocaleString("en-US")}.`);
  log(s, "info", `${players[0].name} goes first.`);
  return s;
}

// ── money transfer & bankruptcy ──────────────────────────────────────────
function credit(s: GameState, playerId: string, amount: number) {
  playerById(s, playerId).cash += amount;
}

/** Force `player` to raise `need` rupees by auto-selling developments then
 *  mortgaging properties (gentlest-first). Returns true if fully covered. */
function liquidate(s: GameState, p: Player, need: number): boolean {
  // sell developments (lowest stage first) for half build cost
  const cities = OWNABLE_POSITIONS.filter(
    (pos) => BOARD[pos].type === "city" && s.properties[pos].ownerId === p.id && s.properties[pos].stage > 0
  );
  cities.sort((a, b) => s.properties[a].stage - s.properties[b].stage);
  for (const pos of cities) {
    while (p.cash < need && s.properties[pos].stage > 0) {
      s.properties[pos].stage = (s.properties[pos].stage - 1) as Stage;
      p.cash += Math.round(BOARD[pos].buildCost! / 2);
    }
    if (p.cash >= need) return true;
  }
  // mortgage properties (lowest mortgage value first)
  const mortgageable = OWNABLE_POSITIONS.filter(
    (pos) => s.properties[pos].ownerId === p.id && !s.properties[pos].mortgaged && s.properties[pos].stage === 0
  );
  mortgageable.sort((a, b) => BOARD[a].mortgage! - BOARD[b].mortgage!);
  for (const pos of mortgageable) {
    if (p.cash >= need) break;
    s.properties[pos].mortgaged = true;
    p.cash += BOARD[pos].mortgage!;
    log(s, "money", `${p.name} mortgages ${BOARD[pos].name} for Rs. ${BOARD[pos].mortgage!.toLocaleString("en-US")} to raise cash.`);
  }
  return p.cash >= need;
}

/** Charge `amount` from `payer`. If `toId` is null the money goes to the bank.
 *  Auto-liquidates if needed; declares bankruptcy if assets are insufficient. */
function charge(s: GameState, payerId: string, amount: number, toId: string | null) {
  const payer = playerById(s, payerId);
  if (payer.cash < amount) liquidate(s, payer, amount);

  if (payer.cash < amount) {
    // BANKRUPTCY — hand everything to the creditor (or back to the bank).
    const owed = payer.cash;
    if (toId) credit(s, toId, owed);
    payer.cash = 0;
    declareBankrupt(s, payer, toId);
    return;
  }
  payer.cash -= amount;
  if (toId) credit(s, toId, amount);
}

function declareBankrupt(s: GameState, payer: Player, creditorId: string | null) {
  payer.bankrupt = true;
  log(s, "bad", `💀 ${payer.name} is BANKRUPT and out of the game!`);
  // transfer / release properties
  for (const pos of OWNABLE_POSITIONS) {
    const prop = s.properties[pos];
    if (prop.ownerId !== payer.id) continue;
    if (creditorId) {
      prop.ownerId = creditorId;
      // developments stay; mortgaged stays mortgaged for the new owner
    } else {
      prop.ownerId = null;
      prop.stage = 0;
      prop.mortgaged = false;
    }
  }
  if (creditorId && payer.jailCards > 0) {
    playerById(s, creditorId).jailCards += payer.jailCards;
  }
  payer.jailCards = 0;
  checkLastStanding(s);
}

function checkLastStanding(s: GameState) {
  if (s.mode === "timed") return; // timed games end by round count
  const alive = activePlayers(s);
  if (alive.length <= 1 && !s.winnerId) {
    s.winnerId = alive[0]?.id ?? null;
    s.phase = "gameOver";
    if (alive[0]) log(s, "good", `🏆 ${alive[0].name} is the last investor standing and wins Pakistan Tycoon!`);
  }
}

// ── movement ───────────────────────────────────────────────────────────────
function moveSteps(s: GameState, p: Player, steps: number) {
  const old = p.position;
  let np = (old + steps) % 40;
  if (np < 0) np += 40;
  p.position = np;
  if (steps > 0 && np < old) {
    credit(s, p.id, GO_SALARY);
    log(s, "money", `${p.name} passes GO — Salary Day! Collects Rs. ${GO_SALARY.toLocaleString("en-US")}.`);
  }
}

function advanceTo(s: GameState, p: Player, target: number, awardGo: boolean) {
  const old = p.position;
  p.position = target;
  if (awardGo && target < old) {
    credit(s, p.id, GO_SALARY);
    log(s, "money", `${p.name} passes GO — Salary Day! Collects Rs. ${GO_SALARY.toLocaleString("en-US")}.`);
  }
}

function sendToJail(s: GameState, p: Player) {
  p.position = JAIL_POS;
  p.inJail = true;
  p.jailTurns = 0;
  s.doublesCount = 0;
  log(s, "jail", `🚔 ${p.name} is sent to Central Lockup.`);
}

// ── landing resolution ─────────────────────────────────────────────────────
function resolveLanding(
  s: GameState,
  opts: { airportMult?: number; utilityForce10?: boolean } = {}
) {
  const p = currentPlayer(s);
  const space = BOARD[p.position];
  const diceSum = s.dice ? s.dice[0] + s.dice[1] : 0;

  switch (space.type) {
    case "city":
    case "airport":
    case "utility": {
      const prop = s.properties[p.position];
      if (!prop.ownerId) {
        s.pending = { type: "buy", pos: p.position };
        log(s, "info", `${p.name} lands on ${space.name} (unowned).`);
      } else if (prop.ownerId === p.id) {
        log(s, "info", `${p.name} lands on their own ${space.name}.`);
      } else if (prop.mortgaged) {
        log(s, "info", `${p.name} lands on ${space.name} — mortgaged, no rent due.`);
      } else {
        const rent = computeRent(s, p.position, diceSum, opts);
        const owner = playerById(s, prop.ownerId);
        log(s, "rent", `${p.name} pays Rs. ${rent.toLocaleString("en-US")} rent to ${owner.name} for ${space.name}.`);
        charge(s, p.id, rent, prop.ownerId);
      }
      break;
    }
    case "tax": {
      log(s, "bad", `${p.name} pays Income Tax (FBR): Rs. ${space.amount!.toLocaleString("en-US")}.`);
      charge(s, p.id, space.amount!, null);
      s.freeParkingPot += space.amount!;
      break;
    }
    case "luxury": {
      log(s, "bad", `${p.name} pays Withholding Tax: Rs. ${space.amount!.toLocaleString("en-US")}.`);
      charge(s, p.id, space.amount!, null);
      s.freeParkingPot += space.amount!;
      break;
    }
    case "gotojail":
      log(s, "jail", `${p.name} is hit with a NAB Investigation!`);
      sendToJail(s, p);
      break;
    case "parking":
      if (s.freeParkingPot > 0) {
        log(s, "good", `${p.name} relaxes at the Chai Dhaba and scoops the pot: Rs. ${s.freeParkingPot.toLocaleString("en-US")}.`);
        credit(s, p.id, s.freeParkingPot);
        s.freeParkingPot = 0;
      } else {
        log(s, "info", `${p.name} stops for chai at the Chai Dhaba. Free parking.`);
      }
      break;
    case "chance":
      drawCard(s, "qismat");
      break;
    case "chest":
      drawCard(s, "awami");
      break;
    case "jail":
      log(s, "info", `${p.name} is just visiting Central Lockup.`);
      break;
    case "go":
      log(s, "money", `${p.name} lands squarely on GO.`);
      break;
  }
}

// ── cards ────────────────────────────────────────────────────────────────
function nearest(positions: number[], from: number): { pos: number; passedGo: boolean } {
  const ahead = positions.filter((p) => p > from);
  if (ahead.length) return { pos: Math.min(...ahead), passedGo: false };
  return { pos: Math.min(...positions), passedGo: true };
}

function drawCard(s: GameState, deck: "qismat" | "awami") {
  const list: Card[] = deck === "qismat" ? QISMAT : AWAMI;
  const order = deck === "qismat" ? s.qismatOrder : s.awamiOrder;
  const posKey = deck === "qismat" ? "qismatPos" : "awamiPos";
  let idx = s[posKey];
  if (idx >= order.length) {
    // reshuffle
    const reshuffled = shuffled(list.length, s);
    if (deck === "qismat") s.qismatOrder = reshuffled;
    else s.awamiOrder = reshuffled;
    s[posKey] = 0;
    idx = 0;
  }
  const card = list[(deck === "qismat" ? s.qismatOrder : s.awamiOrder)[idx]];
  s[posKey] = idx + 1;
  const deckName = deck === "qismat" ? "Qismat" : "Awami Fund";
  log(s, "card", `🃏 ${deckName}: "${card.text}"`);
  applyCard(s, card);
}

function applyCard(s: GameState, card: Card) {
  const p = currentPlayer(s);
  const e = card.effect;
  const diceSum = s.dice ? s.dice[0] + s.dice[1] : 0;
  switch (e.kind) {
    case "collect":
      credit(s, p.id, e.amount);
      break;
    case "pay":
      charge(s, p.id, e.amount, null);
      s.freeParkingPot += e.amount;
      break;
    case "collectFromEach":
      for (const other of s.players) {
        if (other.id === p.id || other.bankrupt) continue;
        charge(s, other.id, e.amount, p.id);
      }
      break;
    case "payEach":
      for (const other of s.players) {
        if (other.id === p.id || other.bankrupt) continue;
        charge(s, p.id, e.amount, other.id);
      }
      break;
    case "moveTo":
      advanceTo(s, p, e.pos, !!e.awardGo);
      resolveLanding(s);
      break;
    case "moveBy":
      moveSteps(s, p, e.steps);
      resolveLanding(s);
      break;
    case "nearestAirport": {
      const { pos, passedGo } = nearest(AIRPORT_POSITIONS, p.position);
      advanceTo(s, p, pos, passedGo);
      resolveLanding(s, { airportMult: 2 });
      break;
    }
    case "nearestUtility": {
      const { pos, passedGo } = nearest(UTILITY_POSITIONS, p.position);
      advanceTo(s, p, pos, passedGo);
      resolveLanding(s, { utilityForce10: true });
      break;
    }
    case "goToJail":
      sendToJail(s, p);
      break;
    case "jailFree":
      p.jailCards += 1;
      break;
    case "repairs": {
      let bill = 0;
      for (const pos of OWNABLE_POSITIONS) {
        const prop = s.properties[pos];
        if (prop.ownerId !== p.id || BOARD[pos].type !== "city") continue;
        bill += prop.stage === 4 ? e.perTower : e.perStageEarly * prop.stage;
      }
      if (bill > 0) {
        log(s, "bad", `${p.name}'s repair/levy bill: Rs. ${bill.toLocaleString("en-US")}.`);
        charge(s, p.id, bill, null);
        s.freeParkingPot += bill;
      } else {
        log(s, "info", `${p.name} has no developed plots — no bill due.`);
      }
      break;
    }
  }
}

// ── public actions ─────────────────────────────────────────────────────────

/** Roll the dice for the current player and resolve their move. */
export function rollDice(s0: GameState): GameState {
  const s = clone(s0);
  if (s.phase !== "preRoll" || s.winnerId) return s0;
  const p = currentPlayer(s);

  if (p.inJail) {
    const d1 = die(s), d2 = die(s);
    s.dice = [d1, d2];
    s.doublesCount = 0;
    if (d1 === d2) {
      p.inJail = false;
      p.jailTurns = 0;
      log(s, "jail", `${p.name} rolls doubles (${d1}+${d2}) and walks free from Central Lockup!`);
      moveSteps(s, p, d1 + d2);
      resolveLanding(s);
    } else {
      p.jailTurns += 1;
      if (p.jailTurns >= 3) {
        log(s, "jail", `${p.name} fails a third time — pays the Rs. ${JAIL_FINE.toLocaleString("en-US")} fine and is released.`);
        charge(s, p.id, JAIL_FINE, null);
        p.inJail = false;
        p.jailTurns = 0;
        if (!p.bankrupt) {
          moveSteps(s, p, d1 + d2);
          resolveLanding(s);
        }
      } else {
        log(s, "jail", `${p.name} rolls ${d1}+${d2} — no doubles, stays in Central Lockup.`);
      }
    }
    s.phase = "resolved";
    return s;
  }

  const d1 = die(s), d2 = die(s);
  s.dice = [d1, d2];
  const isDouble = d1 === d2;
  s.doublesCount = isDouble ? s.doublesCount + 1 : 0;
  log(s, "info", `${p.name} rolls ${d1} + ${d2} = ${d1 + d2}${isDouble ? " (doubles!)" : ""}.`);

  if (s.doublesCount === 3) {
    log(s, "jail", `Three doubles in a row — the law catches up with ${p.name}!`);
    sendToJail(s, p);
    s.phase = "resolved";
    return s;
  }

  moveSteps(s, p, d1 + d2);
  if (!p.bankrupt) resolveLanding(s);
  s.phase = "resolved";
  return s;
}

/** Current player buys the property they are deciding on. */
export function buyProperty(s0: GameState): GameState {
  const s = clone(s0);
  if (s.pending?.type !== "buy") return s0;
  const pos = s.pending.pos;
  const p = currentPlayer(s);
  const space = BOARD[pos];
  const price = space.price!;
  if (p.cash < price) return s0;
  charge(s, p.id, price, null);
  s.properties[pos].ownerId = p.id;
  s.pending = null;
  log(s, "buy", `${p.name} buys ${space.name} for Rs. ${price.toLocaleString("en-US")}.`);
  return s;
}

/** Decline to buy → open a live auction among all active players. */
export function declineBuy(s0: GameState): GameState {
  const s = clone(s0);
  if (s.pending?.type !== "buy") return s0;
  const pos = s.pending.pos;
  s.pending = null;
  const active = activePlayers(s).map((p) => p.id);
  s.auction = {
    pos,
    highBid: 0,
    highBidderId: null,
    active,
    turnIndex: active.indexOf(currentPlayer(s).id) >= 0 ? active.indexOf(currentPlayer(s).id) : 0,
  };
  s.phase = "auction";
  log(s, "info", `${currentPlayer(s).name} declines ${BOARD[pos].name}. Auction opens! (Minimum bid Rs. 100,000)`);
  return s;
}

export const auctionBidder = (s: GameState): Player | null =>
  s.auction ? playerById(s, s.auction.active[s.auction.turnIndex]) : null;

/** Place a bid in the live auction. */
export function placeBid(s0: GameState, playerId: string, amount: number): GameState {
  const s = clone(s0);
  const a = s.auction;
  if (!a) return s0;
  const bidder = playerById(s, playerId);
  if (amount <= a.highBid || amount > bidder.cash) return s0;
  if (a.active[a.turnIndex] !== playerId) return s0;
  a.highBid = amount;
  a.highBidderId = playerId;
  log(s, "money", `${bidder.name} bids Rs. ${amount.toLocaleString("en-US")} for ${BOARD[a.pos].name}.`);
  advanceAuction(s);
  return s;
}

/** Fold out of the live auction. */
export function passBid(s0: GameState, playerId: string): GameState {
  const s = clone(s0);
  const a = s.auction;
  if (!a || a.active[a.turnIndex] !== playerId) return s0;
  const folder = playerById(s, playerId);
  log(s, "info", `${folder.name} drops out of the auction.`);
  const removedIdx = a.turnIndex;
  a.active.splice(removedIdx, 1);
  if (a.turnIndex >= a.active.length) a.turnIndex = 0;
  maybeEndAuction(s);
  return s;
}

function advanceAuction(s: GameState) {
  const a = s.auction!;
  a.turnIndex = (a.turnIndex + 1) % a.active.length;
  maybeEndAuction(s);
}

function maybeEndAuction(s: GameState) {
  const a = s.auction!;
  // ends when one bidder remains (with a standing bid) or nobody wants it
  if (a.active.length === 0) {
    finishAuction(s);
    return;
  }
  if (a.active.length === 1 && a.highBidderId) {
    finishAuction(s);
  }
}

function finishAuction(s: GameState) {
  const a = s.auction!;
  if (a.highBidderId) {
    const winner = playerById(s, a.highBidderId);
    charge(s, winner.id, a.highBid, null);
    s.properties[a.pos].ownerId = winner.id;
    log(s, "buy", `${winner.name} wins the auction for ${BOARD[a.pos].name} at Rs. ${a.highBid.toLocaleString("en-US")}.`);
  } else {
    log(s, "info", `No bids — ${BOARD[a.pos].name} stays with the bank.`);
  }
  s.auction = null;
  s.phase = "resolved";
}

// ── developing / mortgaging ─────────────────────────────────────────────
export function canDevelop(s: GameState, pos: number): boolean {
  const space = BOARD[pos];
  const prop = s.properties[pos];
  const p = currentPlayer(s);
  if (space.type !== "city" || prop.ownerId !== p.id) return false;
  if (prop.stage >= 4 || prop.mortgaged) return false;
  if (!ownsWholeGroup(s, p.id, space.group!)) return false;
  // no mortgages anywhere in the group
  if (GROUP_POSITIONS[space.group!].some((g) => s.properties[g].mortgaged)) return false;
  // even build: cannot exceed the minimum stage in the group + 1
  const minStage = Math.min(...GROUP_POSITIONS[space.group!].map((g) => s.properties[g].stage));
  if (prop.stage > minStage) return false;
  return p.cash >= space.buildCost!;
}

export function develop(s0: GameState, pos: number): GameState {
  const s = clone(s0);
  if (!canDevelop(s, pos)) return s0;
  const space = BOARD[pos];
  const p = currentPlayer(s);
  charge(s, p.id, space.buildCost!, null);
  s.properties[pos].stage = (s.properties[pos].stage + 1) as Stage;
  const STAGE = ["Empty Plot", "Shop", "Plaza", "Commercial Complex", "Corporate Tower"];
  log(s, "build", `${p.name} develops ${space.name} → ${STAGE[s.properties[pos].stage]} (Rs. ${space.buildCost!.toLocaleString("en-US")}).`);
  return s;
}

export function canSellDevelopment(s: GameState, pos: number): boolean {
  const space = BOARD[pos];
  const prop = s.properties[pos];
  const p = currentPlayer(s);
  if (space.type !== "city" || prop.ownerId !== p.id || prop.stage === 0) return false;
  // even sell: can only sell from the highest stage in the group
  const maxStage = Math.max(...GROUP_POSITIONS[space.group!].map((g) => s.properties[g].stage));
  return prop.stage === maxStage;
}

export function sellDevelopment(s0: GameState, pos: number): GameState {
  const s = clone(s0);
  if (!canSellDevelopment(s, pos)) return s0;
  const space = BOARD[pos];
  const p = currentPlayer(s);
  s.properties[pos].stage = (s.properties[pos].stage - 1) as Stage;
  const refund = Math.round(space.buildCost! / 2);
  credit(s, p.id, refund);
  log(s, "money", `${p.name} sells a development on ${space.name} for Rs. ${refund.toLocaleString("en-US")}.`);
  return s;
}

export function canMortgage(s: GameState, pos: number): boolean {
  const prop = s.properties[pos];
  const p = currentPlayer(s);
  if (prop.ownerId !== p.id || prop.mortgaged) return false;
  if (prop.stage > 0) return false;
  // no developments anywhere in the group
  const space = BOARD[pos];
  if (space.type === "city" && GROUP_POSITIONS[space.group!].some((g) => s.properties[g].stage > 0))
    return false;
  return true;
}

export function mortgage(s0: GameState, pos: number): GameState {
  const s = clone(s0);
  if (!canMortgage(s, pos)) return s0;
  const space = BOARD[pos];
  const p = currentPlayer(s);
  s.properties[pos].mortgaged = true;
  credit(s, p.id, space.mortgage!);
  log(s, "money", `${p.name} mortgages ${space.name} for Rs. ${space.mortgage!.toLocaleString("en-US")}.`);
  return s;
}

export function canUnmortgage(s: GameState, pos: number): boolean {
  const prop = s.properties[pos];
  const p = currentPlayer(s);
  if (prop.ownerId !== p.id || !prop.mortgaged) return false;
  return p.cash >= Math.round(BOARD[pos].mortgage! * 1.1);
}

export function unmortgage(s0: GameState, pos: number): GameState {
  const s = clone(s0);
  if (!canUnmortgage(s, pos)) return s0;
  const space = BOARD[pos];
  const p = currentPlayer(s);
  const cost = Math.round(space.mortgage! * 1.1);
  charge(s, p.id, cost, null);
  s.properties[pos].mortgaged = false;
  log(s, "money", `${p.name} lifts the mortgage on ${space.name} (Rs. ${cost.toLocaleString("en-US")}).`);
  return s;
}

// ── jail decisions (taken during preRoll) ──────────────────────────────────
export function payJailFine(s0: GameState): GameState {
  const s = clone(s0);
  const p = currentPlayer(s);
  if (!p.inJail || s.phase !== "preRoll") return s0;
  charge(s, p.id, JAIL_FINE, null);
  p.inJail = false;
  p.jailTurns = 0;
  log(s, "jail", `${p.name} pays the Rs. ${JAIL_FINE.toLocaleString("en-US")} fine and is released. Roll to move.`);
  return s;
}

export function useJailCard(s0: GameState): GameState {
  const s = clone(s0);
  const p = currentPlayer(s);
  if (!p.inJail || p.jailCards <= 0 || s.phase !== "preRoll") return s0;
  p.jailCards -= 1;
  p.inJail = false;
  p.jailTurns = 0;
  log(s, "jail", `${p.name} uses a court-release card and walks free. Roll to move.`);
  return s;
}

// ── trading ────────────────────────────────────────────────────────────────
function tradablePos(s: GameState, ownerId: string, pos: number): boolean {
  const prop = s.properties[pos];
  if (prop.ownerId !== ownerId) return false;
  // cannot trade a property if its colour group has any developments
  const space = BOARD[pos];
  if (space.type === "city" && GROUP_POSITIONS[space.group!].some((g) => s.properties[g].stage > 0))
    return false;
  return true;
}

export function proposeTrade(s0: GameState, t: TradeProposal): GameState {
  const s = clone(s0);
  const from = playerById(s, t.fromId);
  if (from.cash < t.giveCash) return s0;
  if (!t.giveProps.every((p) => tradablePos(s, t.fromId, p))) return s0;
  if (!t.wantProps.every((p) => tradablePos(s, t.toId, p))) return s0;
  s.trade = { id: `t${s.logCounter}`, status: "open", ...t };
  log(s, "info", `${from.name} proposes a trade to ${playerById(s, t.toId).name}.`);
  return s;
}

export function respondTrade(s0: GameState, accept: boolean): GameState {
  const s = clone(s0);
  const t = s.trade;
  if (!t || t.status !== "open") return s0;
  const from = playerById(s, t.fromId);
  const to = playerById(s, t.toId);
  if (!accept) {
    s.trade = null;
    log(s, "info", `${to.name} declines the trade.`);
    return s;
  }
  if (from.cash < t.giveCash || to.cash < t.wantCash) {
    s.trade = null;
    log(s, "info", `Trade fell through — insufficient funds.`);
    return s;
  }
  // execute
  from.cash -= t.giveCash;
  to.cash += t.giveCash;
  to.cash -= t.wantCash;
  from.cash += t.wantCash;
  for (const pos of t.giveProps) s.properties[pos].ownerId = to.id;
  for (const pos of t.wantProps) s.properties[pos].ownerId = from.id;
  s.trade = null;
  log(s, "good", `✅ Trade accepted between ${from.name} and ${to.name}.`);
  return s;
}

// ── end of turn / rounds / events / win conditions ──────────────────────────
export function endTurn(s0: GameState): GameState {
  const s = clone(s0);
  if (s.phase !== "resolved" || s.pending || s.winnerId) return s0;
  const p = currentPlayer(s);

  // doubles → same player rolls again (unless they were jailed this turn)
  const rolledDouble = s.dice && s.dice[0] === s.dice[1];
  if (rolledDouble && !p.inJail && !p.bankrupt && s.doublesCount > 0 && s.doublesCount < 3) {
    s.phase = "preRoll";
    s.dice = null;
    log(s, "info", `${p.name} rolled doubles and takes another turn.`);
    return s;
  }

  // advance to next active player
  s.doublesCount = 0;
  s.turnCount += 1;
  const n = s.players.length;
  let next = s.currentIndex;
  for (let i = 1; i <= n; i++) {
    const cand = (s.currentIndex + i) % n;
    if (!s.players[cand].bankrupt) {
      next = cand;
      break;
    }
  }
  const wrapped = next <= s.currentIndex;
  s.currentIndex = next;
  s.dice = null;
  s.phase = "preRoll";

  if (wrapped) startNewRound(s);
  return s;
}

function startNewRound(s: GameState) {
  s.round += 1;
  // decay active modifiers
  s.modifiers = s.modifiers
    .map((m) => ({ ...m, roundsLeft: m.roundsLeft - 1 }))
    .filter((m) => m.roundsLeft > 0);

  // national event every 5 rounds
  if (s.round % 5 === 0) {
    const ev = NATIONAL_EVENTS[Math.floor(rand(s) * NATIONAL_EVENTS.length)];
    s.modifiers.push(ev.make());
    log(s, "event", `📰 NATIONAL EVENT — ${ev.name}: ${ev.desc}`);
  }

  // timed / quick mode: end after maxRounds → highest net worth wins
  if ((s.mode === "timed" || s.mode === "quick") && s.round > s.maxRounds) {
    const ranked = [...activePlayers(s)].sort((a, b) => netWorth(s, b) - netWorth(s, a));
    s.winnerId = ranked[0]?.id ?? null;
    s.phase = "gameOver";
    if (ranked[0])
      log(s, "good", `🏆 Time's up after ${s.maxRounds} rounds! ${ranked[0].name} wins with the highest net worth: Rs. ${netWorth(s, ranked[0]).toLocaleString("en-US")}.`);
  } else {
    log(s, "info", `— Round ${s.round} begins —`);
  }
}

/** Convenience predicate for the UI/AI. */
export function canBuyCurrent(s: GameState): boolean {
  if (s.pending?.type !== "buy") return false;
  const p = currentPlayer(s);
  return p.cash >= BOARD[s.pending.pos].price!;
}
