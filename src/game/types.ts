// ─────────────────────────────────────────────────────────────────────────
// Pakistan Tycoon — core type definitions
// The engine is written as pure functions over these serializable types so
// that the exact same logic can run client-side (vs AI) or authoritatively on
// a Socket.IO server for real-time multiplayer (phase 2).
// ─────────────────────────────────────────────────────────────────────────

export type ColorGroup =
  | "brown"
  | "lightblue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkblue";

export type SpaceType =
  | "go"
  | "city"
  | "airport"
  | "utility"
  | "tax"
  | "luxury"
  | "jail" // Central Lockup (just visiting / in jail)
  | "gotojail" // NAB Investigation
  | "parking" // Chai Dhaba
  | "chance" // Qismat
  | "chest"; // Awami Fund

/** Development stages replacing houses/hotels. */
export const STAGE_NAMES = [
  "Empty Plot",
  "Shop",
  "Plaza",
  "Commercial Complex",
  "Corporate Tower",
] as const;
export type Stage = 0 | 1 | 2 | 3 | 4;

/** Static definition of a board space (never mutated during play). */
export interface BoardSpace {
  pos: number;
  type: SpaceType;
  name: string;
  /** Short flavour / bonus identity shown in the UI. */
  bonus?: string;
  // Ownable-property fields
  group?: ColorGroup;
  price?: number;
  /** Rent per stage for cities: [base, shop, plaza, complex, tower]. */
  rent?: number[];
  /** Cost to add one development stage. */
  buildCost?: number;
  mortgage?: number;
  // Tax fields
  amount?: number;
}

/** Mutable per-property ownership / development state, keyed by board pos. */
export interface PropertyState {
  ownerId: string | null;
  stage: Stage;
  mortgaged: boolean;
}

export type AILevel = "easy" | "normal" | "hard";

export interface Player {
  id: string;
  name: string;
  token: string; // emoji token
  color: string; // accent colour
  isAI: boolean;
  aiLevel: AILevel;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: number; // "Released by court order" cards held
  bankrupt: boolean;
}

export type CardEffect =
  | { kind: "collect"; amount: number }
  | { kind: "pay"; amount: number }
  | { kind: "collectFromEach"; amount: number }
  | { kind: "payEach"; amount: number }
  | { kind: "moveTo"; pos: number; awardGo?: boolean }
  | { kind: "moveBy"; steps: number }
  | { kind: "nearestAirport" }
  | { kind: "nearestUtility" }
  | { kind: "goToJail" }
  | { kind: "jailFree" }
  | { kind: "repairs"; perStageEarly: number; perTower: number };

export interface Card {
  id: string;
  text: string;
  effect: CardEffect;
}

export interface ActiveModifier {
  id: string;
  name: string;
  desc: string;
  roundsLeft: number;
  /** Multiplier applied to all rent. */
  globalRent?: number;
  /** Multiplier applied to rent for specific color groups. */
  groupRent?: Partial<Record<ColorGroup, number>>;
  /** Multiplier applied to utility rent. */
  utilityRent?: number;
  /** Multiplier applied to airport rent. */
  airportRent?: number;
}

export type GameMode = "classic" | "timed" | "quick";

export type Phase =
  | "preRoll"
  | "resolved" // landed & resolved; player may manage then end turn
  | "auction"
  | "gameOver";

/** A decision that blocks turn progression until resolved. */
export type Pending =
  | { type: "buy"; pos: number }
  | { type: "jail" }
  | null;

export interface AuctionState {
  pos: number;
  highBid: number;
  highBidderId: string | null;
  /** Players still allowed to bid (have not folded / not bankrupt). */
  active: string[];
  turnIndex: number; // index into active[] whose turn it is to bid
}

export interface TradeOffer {
  id: string;
  fromId: string;
  toId: string;
  // what `from` gives
  giveCash: number;
  giveProps: number[];
  // what `from` wants
  wantCash: number;
  wantProps: number[];
  status: "open" | "accepted" | "declined";
}

export interface TradeProposal {
  fromId: string;
  toId: string;
  giveCash: number;
  giveProps: number[];
  wantCash: number;
  wantProps: number[];
}

export interface LogEntry {
  id: number;
  text: string;
  /** kind drives colour in the UI log. */
  kind: "info" | "money" | "rent" | "buy" | "build" | "event" | "card" | "jail" | "bad" | "good";
}

export interface GameState {
  mode: GameMode;
  maxRounds: number; // for timed mode
  players: Player[];
  properties: Record<number, PropertyState>;
  currentIndex: number;
  phase: Phase;
  dice: [number, number] | null;
  doublesCount: number;
  /** Increments each time play passes back to the first non-bankrupt player. */
  round: number;
  turnCount: number;
  pending: Pending;
  auction: AuctionState | null;
  trade: TradeOffer | null;
  modifiers: ActiveModifier[];
  log: LogEntry[];
  // card decks (arrays of indices into the master card lists)
  qismatOrder: number[];
  qismatPos: number;
  awamiOrder: number[];
  awamiPos: number;
  rngState: number; // seeded RNG state
  logCounter: number;
  winnerId: string | null;
  freeParkingPot: number; // Chai Dhaba pot (house rule, taxes accumulate)
}
