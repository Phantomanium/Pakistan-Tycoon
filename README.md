# 🕌 Pakistan Tycoon

A Monopoly-inspired property-empire board game themed around Pakistan's
cities, economy and culture. Buy cities from **Kasur to DHA Lahore**, develop
**Empty Plots → Shops → Plazas → Commercial Complexes → Corporate Towers**,
collect rent, survive the **FBR** and **NAB**, and ride **national events**
like the PSL season and monsoon floods to the top.

Built with **Vite + React + TypeScript**. Plays right now against **AI
opponents** (Easy / Normal / Hard) or local hot-seat humans.

![mode: classic / timed / quick](https://img.shields.io/badge/modes-classic%20%7C%20timed%20%7C%20quick-2c8)

---

## Run it

```bash
npm install
npm run dev      # open http://localhost:5173
```

Build for production:

```bash
npm run build    # type-checks then bundles to dist/
npm run preview  # serve the production build
```

Requires Node 18+ (developed on Node 24).

### Play online (real-time multiplayer)

Run the game server in a second terminal:

```bash
cd server
npm install
npm run dev      # authoritative Socket.IO server on http://localhost:3001
```

Then in the app choose **Play Online** → create a private room (share the
invite code) or join a public game. In dev the client auto-connects to
`localhost:3001`. For a single-deploy setup, `npm run build` the client and the
server will serve `dist/` from the same origin.

---

## What's in the game

**Board & economy**
- Full 40-space board with all the cities, colour groups, airports and
  utilities from the spec, priced in **PKR** (Rs. 15,000,000 starting cash,
  Rs. 2,000,000 for passing GO). Values are tuned from classic Monopoly
  balance (×10,000) so the game plays fairly.
- Each city carries its own **bonus identity** (shown in the property card).
- **Airports** (Jinnah, Allama Iqbal, Islamabad, Bacha Khan) scale fees with
  how many you own; **utilities** (WAPDA, Sui Northern) scale with the dice.

**Special spaces** — GO (Salary Day), Income Tax (FBR), Withholding Tax,
Central Lockup (jail), Chai Dhaba (free parking, collects the tax pot),
NAB Investigation (go to jail).

**Cards** — 56 **Qismat** (Chance) + 56 **Awami Fund** (Community Chest) cards,
all normalised to the PKR economy, with collect/pay, move, jail, "collect from
everyone", repairs/levy and more.

**National Events** — every 5 rounds a country-wide event fires (PSL Season,
Monsoon Flooding, Economic Boom/Slowdown, Fuel Price Increase, IT Expansion,
Real Estate Bubble, Export Growth, Infrastructure Investment), layering
temporary rent modifiers.

**Mechanics** — dice + doubles (3 doubles → jail), even-build development,
mortgaging, **live auctions** when a property is declined, **multi-property +
cash trading** with counteroffers, and forced auto-liquidation before
bankruptcy.

**AI opponents** — Easy / Normal / Hard tune cash reserves, auction
aggression, monopoly greed, and how hard they develop. They buy, bid, build,
manage jail, and evaluate trade offers.

**Win modes**
- **Classic** — last investor standing.
- **Timed** — ends after N rounds; highest net worth wins.
- **Quick** — leaner economy, 12-round cap.

**UI** — responsive (mobile-first), dark/light themes, dice & token
animations, activity log, card/event toasts, Pakistani-inspired palette.

---

## Architecture

```
src/
  game/
    types.ts     # all serializable game types
    board.ts     # 40 spaces, prices, rents, bonuses, group metadata
    cards.ts     # Qismat + Awami Fund decks
    events.ts    # national events
    engine.ts    # PURE game logic — every action: GameState -> GameState
    ai.ts        # read-only AI analysers (Easy/Normal/Hard)
    format.ts    # PKR formatting
  game/
    actions.ts   # GameAction union + runAction() — shared by client & server
  ui/
    Setup.tsx    # local new-game configuration
    Online.tsx   # main menu + online lobby (create/join/browse/room)
    Board.tsx    # 11×11 grid board + dice + center
    Sidebar.tsx  # controls, player cards, log
    Modals.tsx   # property, auction, trade, game-over, toast
  store.ts       # game-state store + send() transport (local | online)
  net.ts         # socket.io client + lobby/connection store
  App.tsx        # screen routing, local AI driver, modals

server/
  src/
    index.ts     # Express + Socket.IO: handlers, AI loop, 60s turn timer
    rooms.ts     # in-memory room/lobby manager, invite codes, sessions
    protocol.ts  # wire types (LobbyView, etc.)
    test-client.ts # headless integration test
```

The engine is **pure and seeded** (mulberry32 RNG stored in the state), so a
game is fully reproducible from its seed and action list — which is exactly
what makes the server authoritative.

---

## Phase 2 — online multiplayer (implemented)

The real-time multiplayer **core is built and tested**:

- **Server-authoritative engine.** The same pure `runAction(state, action)`
  ([src/game/actions.ts](src/game/actions.ts)) runs on the **Node + Express +
  Socket.IO** server. Clients only send action *intents*; the server checks
  `requiredActor` (turn ownership + legality), applies the engine action, and
  broadcasts the new `GameState`. Anti-cheat is "re-run the engine and ignore
  illegal/out-of-turn intents".
- **One integration point.** `send(action)` in [src/store.ts](src/store.ts)
  routes to the local engine (offline) or emits to the server (online) — the
  React components and engine are unchanged between modes.
- **Lobbies / matchmaking** — public listing + private rooms with 6-char
  invite codes, host seat management, and AI seats to fill the table.
- **Server-side AI** — when it's an AI's turn (or auction/trade), the server
  steps the AI loop and broadcasts; clients just render.
- **60s turn timer** — the server arms a timer on each human turn and
  auto-acts on expiry (roll / decline / end turn / pass / decline trade).
- **Reconnection** — every human gets a session token; reconnecting resends
  the live state and rebinds the seat.
- **Spectators** — join a room by code to watch a live game read-only.

Verify it headlessly: with the server running, `cd server && npx tsx
src/test-client.ts` plays a 2-human + AI game over several rounds and checks
sync, AI, and reconnection.

### Still to layer on (next sub-phase)

In-memory rooms are great for play but not durable. The remaining spec items
build directly on this core:

- **Accounts** (signup/login) and **PostgreSQL** persistence — `GameState` is
  plain JSON, so save/resume is an upsert; the `rooms.ts` manager is the seam
  to swap an in-memory `Map` for a DB-backed store.
- **Match history & leaderboards** — persist finished games and rank players
  by `netWorth` / wins.
- **Profiles, friend invites, richer chat/emotes.**

---

## Notes & simplifications (this build)

- Online rooms are **in-memory** (no DB yet) — fine for live play; persistence
  is the next sub-phase above.
- City "bonus identities" are shown on every property and a representative set
  is wired into scoring/events; the rest are flavour for now.
- When a player can't cover a payment, the engine **auto-liquidates**
  (sell developments, then mortgage cheapest-first) before declaring
  bankruptcy, so the game never deadlocks.
- Chai Dhaba uses the popular house rule: taxes/fees accumulate in a pot the
  next visitor collects.
