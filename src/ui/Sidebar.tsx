import { useEffect, useRef } from "react";
import { BOARD, OWNABLE_POSITIONS } from "../game/board";
import { canBuyCurrent, netWorth } from "../game/engine";
import { pkr } from "../game/format";
import type { GameState, Player } from "../game/types";

interface Handlers {
  onRoll: () => void;
  onBuy: () => void;
  onDecline: () => void;
  onEndTurn: () => void;
  onPayJail: () => void;
  onJailCard: () => void;
  onOpenTrade: () => void;
  onSelectPlayer: (id: string) => void;
}

export default function Sidebar({ game, h, canAct }: { game: GameState; h: Handlers; canAct: boolean }) {
  const cur = game.players[game.currentIndex];
  return (
    <aside className="sidebar">
      <Controls game={game} h={h} canAct={canAct} />
      <div className="players-panel">
        {[...game.players].map((p) => (
          <PlayerCard key={p.id} game={game} p={p} isCurrent={p.id === cur.id} onClick={() => h.onSelectPlayer(p.id)} />
        ))}
      </div>
      <Log game={game} />
    </aside>
  );
}

function Controls({ game, h, canAct }: { game: GameState; h: Handlers; canAct: boolean }) {
  const cur = game.players[game.currentIndex];

  if (game.winnerId) return null;

  if (!canAct) {
    return (
      <div className="controls thinking">
        <span className="spinner" /> {cur.isAI ? `${cur.name} is thinking…` : `Waiting for ${cur.name}…`}
      </div>
    );
  }

  return (
    <div className="controls">
      {game.phase === "preRoll" && !cur.inJail && (
        <button className="btn primary big" onClick={h.onRoll}>🎲 Roll Dice</button>
      )}
      {game.phase === "preRoll" && cur.inJail && (
        <div className="jail-controls">
          <div className="jail-note">🔒 You're in Central Lockup (attempt {cur.jailTurns + 1}/3).</div>
          <button className="btn primary" onClick={h.onRoll}>🎲 Roll for doubles</button>
          <button className="btn" onClick={h.onPayJail}>Pay {pkr(500000)} fine</button>
          {cur.jailCards > 0 && (
            <button className="btn good" onClick={h.onJailCard}>Use release card ({cur.jailCards})</button>
          )}
        </div>
      )}
      {game.pending?.type === "buy" && (
        <div className="buy-controls">
          <div className="buy-title">{BOARD[game.pending.pos].name}</div>
          <div className="buy-price">{pkr(BOARD[game.pending.pos].price!)}</div>
          <div className="buy-actions">
            <button className="btn primary" disabled={!canBuyCurrent(game)} onClick={h.onBuy}>
              Buy
            </button>
            <button className="btn" onClick={h.onDecline}>Auction</button>
          </div>
          {!canBuyCurrent(game) && <div className="muted small">Not enough cash to buy.</div>}
        </div>
      )}
      {game.phase === "resolved" && !game.pending && (
        <div className="end-controls">
          <button className="btn ghost" onClick={h.onOpenTrade}>🤝 Trade</button>
          <button className="btn primary big" onClick={h.onEndTurn}>End Turn ▸</button>
          <div className="muted small">Tap any property you own to develop or mortgage it.</div>
        </div>
      )}
    </div>
  );
}

function PlayerCard({
  game,
  p,
  isCurrent,
  onClick,
}: {
  game: GameState;
  p: Player;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const props = OWNABLE_POSITIONS.filter((pos) => game.properties[pos].ownerId === p.id);
  const worth = netWorth(game, p);
  return (
    <button
      className={`player-card ${isCurrent ? "current" : ""} ${p.bankrupt ? "bankrupt" : ""}`}
      style={{ "--pc": p.color } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="pc-head">
        <span className="pc-token">{p.token}</span>
        <span className="pc-name">{p.name}</span>
        {p.isAI && <span className="pc-ai">{p.aiLevel}</span>}
        {p.inJail && <span className="pc-jail">🔒</span>}
        {p.jailCards > 0 && <span className="pc-card" title="Release cards">🎟️{p.jailCards}</span>}
      </div>
      <div className="pc-cash">{pkr(p.cash)}</div>
      <div className="pc-stats">
        <span>🏙️ {props.length} assets</span>
        <span>📊 {pkr(worth)} net</span>
      </div>
    </button>
  );
}

function Log({ game }: { game: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [game.log.length]);
  return (
    <div className="log" ref={ref}>
      {game.log.map((e) => (
        <div key={e.id} className={`log-entry k-${e.kind}`}>
          {e.text}
        </div>
      ))}
    </div>
  );
}
