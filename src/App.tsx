import { useCallback, useEffect, useRef, useState } from "react";
import { useGame, send, getMyId, isOnline, leaveGame } from "./store";
import { connect, leaveRoom, useNet } from "./net";
import Setup from "./ui/Setup";
import Board from "./ui/Board";
import Sidebar from "./ui/Sidebar";
import { MainMenu, OnlineScreen } from "./ui/Online";
import {
  AuctionModal,
  GameOverModal,
  IncomingTradeModal,
  PropertyModal,
  Toast,
  TradeModal,
} from "./ui/Modals";
import { auctionBidder, currentPlayer } from "./game/engine";
import {
  aiAcceptTrade,
  aiAuctionMove,
  aiNextDevelopment,
  aiPreRoll,
  aiShouldBuy,
} from "./game/ai";
import type { GameAction } from "./game/actions";
import type { GameState } from "./game/types";

const MODE_LABEL: Record<string, string> = { classic: "Classic", timed: "Timed", quick: "Quick" };
type Screen = "home" | "local" | "online";

export default function App() {
  const game = useGame();
  const net = useNet();
  const online = isOnline();
  const myId = getMyId();

  const [screen, setScreen] = useState<Screen>("home");
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("pt-theme") as "dark" | "light") || "dark"
  );
  const [rolling, setRolling] = useState(false);
  const rollingRef = useRef(false);
  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [showTrade, setShowTrade] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const lastToast = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pt-theme", theme);
  }, [theme]);

  const performRoll = useCallback(() => {
    if (rollingRef.current) return;
    rollingRef.current = true;
    setRolling(true);
    window.setTimeout(() => {
      setRolling(false);
      rollingRef.current = false;
      send({ t: "roll" });
    }, 650);
  }, []);

  // card / national-event toast
  useEffect(() => {
    if (!game || !game.log.length) return;
    const newestId = game.log[game.log.length - 1].id;
    if (newestId <= lastToast.current) return;
    let found: { text: string; kind: string } | null = null;
    for (const e of game.log) {
      if (e.id > lastToast.current && (e.kind === "card" || e.kind === "event")) {
        found = { text: e.text, kind: e.kind };
      }
    }
    lastToast.current = newestId;
    if (found) {
      setToast(found);
      const t = window.setTimeout(() => setToast(null), 3400);
      return () => clearTimeout(t);
    }
  }, [game?.logCounter]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI driver — local games only (online AI runs on the server)
  useEffect(() => {
    if (online || !game || game.winnerId || rolling) return;
    const due = aiDue(game);
    if (!due) return;
    const t = window.setTimeout(() => stepAI(game, performRoll), due);
    return () => clearTimeout(t);
  }, [game, rolling, online, performRoll]);

  function goHome() {
    if (online || net.lobby) leaveRoom();
    else leaveGame();
    setScreen("home");
  }

  // ── screens before a game is running ─────────────────────────────────────
  if (!game) {
    if (screen === "local") return <Setup onBack={() => setScreen("home")} />;
    if (screen === "online") return <OnlineScreen onBack={() => setScreen("home")} />;
    return (
      <MainMenu
        onLocal={() => setScreen("local")}
        onOnline={() => {
          connect();
          setScreen("online");
        }}
      />
    );
  }

  // ── in-game ──────────────────────────────────────────────────────────────
  const cur = game.players[game.currentIndex];
  const canAct = !cur.isAI && (!online || cur.id === myId);
  const tradeForHuman =
    game.trade?.status === "open" &&
    !game.players.find((p) => p.id === game.trade!.toId)!.isAI &&
    (!online || game.trade!.toId === myId);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-emblem">🕌</span>
          <span className="brand-name">Pakistan <span className="accent">Tycoon</span></span>
        </div>
        <div className="topbar-info">
          <span className="chip">Round {game.round}{game.mode !== "classic" ? ` / ${game.maxRounds}` : ""}</span>
          <span className="chip">{MODE_LABEL[game.mode]}</span>
          {online && <span className="chip net-chip">🌐 Online</span>}
          {online && net.spectator && <span className="chip">👀 Spectating</span>}
          {online && <TurnTimer />}
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="btn ghost small" onClick={() => { if (confirm("Leave this game?")) goHome(); }}>
            Leave
          </button>
        </div>
      </header>

      <main className="game-layout">
        <div className="board-wrap">
          <Board game={game} rolling={rolling} canRoll={canAct} onRoll={performRoll} onTile={(pos) => setSelectedPos(pos)} />
        </div>
        <Sidebar
          game={game}
          canAct={canAct}
          h={{
            onRoll: performRoll,
            onBuy: () => send({ t: "buy" }),
            onDecline: () => send({ t: "decline" }),
            onEndTurn: () => send({ t: "endTurn" }),
            onPayJail: () => send({ t: "payJail" }),
            onJailCard: () => send({ t: "useJailCard" }),
            onOpenTrade: () => setShowTrade(true),
            onSelectPlayer: () => {},
          }}
        />
      </main>

      {selectedPos != null && (
        <PropertyModal game={game} pos={selectedPos} canAct={canAct} onClose={() => setSelectedPos(null)} />
      )}
      {showTrade && !game.trade && canAct && <TradeModal game={game} onClose={() => setShowTrade(false)} />}
      {tradeForHuman && <IncomingTradeModal game={game} />}
      {game.phase === "auction" && game.auction && <AuctionModal game={game} myId={myId} online={online} />}
      {game.winnerId && <GameOverModal game={game} onExit={goHome} />}
      {toast && <Toast text={toast.text} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
}

function TurnTimer() {
  const net = useNet();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  if (!net.turn?.deadline) return null;
  const left = Math.max(0, Math.round((net.turn.deadline - now) / 1000));
  return <span className={`chip timer ${left <= 10 ? "low" : ""}`}>⏱ {left}s</span>;
}

// ── local AI scheduling ────────────────────────────────────────────────────
function aiDue(g: GameState): number | null {
  if (g.phase === "auction") {
    const b = auctionBidder(g);
    return b?.isAI ? 750 : null;
  }
  if (g.trade?.status === "open") {
    const to = g.players.find((p) => p.id === g.trade!.toId)!;
    return to.isAI ? 800 : null;
  }
  const cur = g.players[g.currentIndex];
  if (!cur.isAI) return null;
  if (g.phase === "preRoll") return 700;
  if (g.phase === "resolved") return g.pending?.type === "buy" ? 750 : 550;
  return null;
}

function stepAI(g: GameState, performRoll: () => void) {
  if (g.phase === "auction") {
    const b = auctionBidder(g);
    if (!b?.isAI) return;
    const mv = aiAuctionMove(g);
    send(mv === "pass" ? { t: "passBid", playerId: b.id } : { t: "placeBid", playerId: b.id, amount: mv.bid });
    return;
  }
  if (g.trade?.status === "open") {
    const to = g.players.find((p) => p.id === g.trade!.toId)!;
    if (to.isAI) send({ t: "respondTrade", accept: aiAcceptTrade(g, g.trade) });
    return;
  }
  const cur = currentPlayer(g);
  if (!cur.isAI) return;
  if (g.phase === "preRoll") {
    const d = aiPreRoll(g);
    if (d === "pay") send({ t: "payJail" });
    else if (d === "card") send({ t: "useJailCard" });
    else performRoll();
    return;
  }
  if (g.phase === "resolved") {
    if (g.pending?.type === "buy") {
      send(aiShouldBuy(g) ? { t: "buy" } : { t: "decline" });
      return;
    }
    const dev = aiNextDevelopment(g);
    const action: GameAction = dev != null ? { t: "develop", pos: dev } : { t: "endTurn" };
    send(action);
  }
}
