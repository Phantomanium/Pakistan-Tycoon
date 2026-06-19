import { useState } from "react";
import { createGame, COLORS, TOKENS, type PlayerConfig } from "../game/engine";
import type { AILevel, GameMode } from "../game/types";
import { startLocalGame } from "../store";

interface Seat {
  name: string;
  isAI: boolean;
  aiLevel: AILevel;
  token: string;
  color: string;
}

const DEFAULT_SEATS: Seat[] = [
  { name: "You", isAI: false, aiLevel: "normal", token: TOKENS[0], color: COLORS[0] },
  { name: "Babar (AI)", isAI: true, aiLevel: "normal", token: TOKENS[1], color: COLORS[1] },
  { name: "Ayesha (AI)", isAI: true, aiLevel: "hard", token: TOKENS[2], color: COLORS[2] },
];

const AI_NAMES = ["Babar", "Ayesha", "Imran", "Sana", "Bilal", "Zara"];

export default function Setup({ onBack }: { onBack?: () => void }) {
  const [seats, setSeats] = useState<Seat[]>(DEFAULT_SEATS);
  const [mode, setMode] = useState<GameMode>("classic");
  const [maxRounds, setMaxRounds] = useState(20);

  function update(i: number, patch: Partial<Seat>) {
    setSeats((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addSeat() {
    if (seats.length >= 6) return;
    const i = seats.length;
    setSeats([
      ...seats,
      {
        name: `${AI_NAMES[i % AI_NAMES.length]} (AI)`,
        isAI: true,
        aiLevel: "normal",
        token: TOKENS[i % TOKENS.length],
        color: COLORS[i % COLORS.length],
      },
    ]);
  }

  function removeSeat(i: number) {
    if (seats.length <= 2) return;
    setSeats(seats.filter((_, idx) => idx !== i));
  }

  function start() {
    const players: PlayerConfig[] = seats.map((s) => ({
      name: s.name.trim() || "Investor",
      isAI: s.isAI,
      aiLevel: s.aiLevel,
      token: s.token,
      color: s.color,
    }));
    startLocalGame(
      createGame({
        players,
        mode,
        maxRounds: mode === "timed" ? maxRounds : undefined,
      })
    );
  }

  return (
    <div className="setup-screen">
      {onBack && (
        <button className="btn ghost small back-btn" onClick={onBack}>
          ‹ Back
        </button>
      )}
      <div className="setup-hero">
        <div className="hero-emblem">🕌</div>
        <h1>
          Pakistan <span className="accent">Tycoon</span>
        </h1>
        <p className="tagline">Build the largest property empire across Pakistan — from Kasur to DHA.</p>
      </div>

      <div className="setup-card">
        <h2>Investors <span className="muted">({seats.length}/6)</span></h2>
        <div className="seat-list">
          {seats.map((seat, i) => (
            <div className="seat-row" key={i} style={{ borderLeftColor: seat.color }}>
              <div className="seat-tokens">
                {TOKENS.map((t) => (
                  <button
                    key={t}
                    className={`token-pick ${seat.token === t ? "selected" : ""}`}
                    onClick={() => update(i, { token: t })}
                    aria-label={`token ${t}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                className="seat-name"
                value={seat.name}
                onChange={(e) => update(i, { name: e.target.value })}
                maxLength={18}
              />
              <div className="seat-type">
                <button
                  className={`pill ${!seat.isAI ? "on" : ""}`}
                  onClick={() => update(i, { isAI: false, name: seat.name.replace(" (AI)", "") })}
                >
                  Human
                </button>
                <button
                  className={`pill ${seat.isAI ? "on" : ""}`}
                  onClick={() => update(i, { isAI: true })}
                >
                  AI
                </button>
              </div>
              {seat.isAI ? (
                <select
                  className="seat-diff"
                  value={seat.aiLevel}
                  onChange={(e) => update(i, { aiLevel: e.target.value as AILevel })}
                >
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
              ) : (
                <span className="seat-diff placeholder" />
              )}
              <div className="seat-colors">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`color-pick ${seat.color === c ? "selected" : ""}`}
                    style={{ background: c }}
                    onClick={() => update(i, { color: c })}
                    aria-label="player colour"
                  />
                ))}
              </div>
              <button className="seat-remove" onClick={() => removeSeat(i)} disabled={seats.length <= 2}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button className="btn ghost add-seat" onClick={addSeat} disabled={seats.length >= 6}>
          + Add investor
        </button>
      </div>

      <div className="setup-card">
        <h2>Game Mode</h2>
        <div className="mode-grid">
          <ModeCard
            active={mode === "classic"}
            onClick={() => setMode("classic")}
            title="Classic"
            desc="Bankrupt every rival. Last investor standing wins."
            icon="👑"
          />
          <ModeCard
            active={mode === "timed"}
            onClick={() => setMode("timed")}
            title="Timed"
            desc="Game ends after a set number of rounds. Highest net worth wins."
            icon="⏱️"
          />
          <ModeCard
            active={mode === "quick"}
            onClick={() => setMode("quick")}
            title="Quick"
            desc="Leaner economy and a 12-round cap for a fast game."
            icon="⚡"
          />
        </div>
        {mode === "timed" && (
          <label className="rounds-input">
            Rounds:
            <input
              type="number"
              min={5}
              max={60}
              value={maxRounds}
              onChange={(e) => setMaxRounds(Math.max(5, Math.min(60, Number(e.target.value) || 20)))}
            />
          </label>
        )}
      </div>

      <button className="btn primary big start-btn" onClick={start}>
        Start Game ▸
      </button>
    </div>
  );
}

function ModeCard(props: { active: boolean; onClick: () => void; title: string; desc: string; icon: string }) {
  return (
    <button className={`mode-card ${props.active ? "active" : ""}`} onClick={props.onClick}>
      <span className="mode-icon">{props.icon}</span>
      <span className="mode-title">{props.title}</span>
      <span className="mode-desc">{props.desc}</span>
    </button>
  );
}
