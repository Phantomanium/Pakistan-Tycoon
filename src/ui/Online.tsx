import { useEffect, useState } from "react";
import type { AILevel, GameMode } from "../game/types";
import {
  addAI,
  createRoom,
  joinRoom,
  leaveRoom,
  refreshRooms,
  removeSeat,
  setConfig,
  spectate,
  startOnlineGame,
  useNet,
} from "../net";

// ── Main menu (local vs online) ─────────────────────────────────────────
export function MainMenu({ onLocal, onOnline }: { onLocal: () => void; onOnline: () => void }) {
  return (
    <div className="setup-screen">
      <div className="setup-hero">
        <div className="hero-emblem">🕌</div>
        <h1>
          Pakistan <span className="accent">Tycoon</span>
        </h1>
        <p className="tagline">Build the largest property empire across Pakistan — from Kasur to DHA.</p>
      </div>
      <div className="menu-grid">
        <button className="menu-card" onClick={onLocal}>
          <span className="menu-icon">🤖</span>
          <span className="menu-title">Play vs AI</span>
          <span className="menu-desc">Single device. Face AI opponents or pass-and-play with friends.</span>
        </button>
        <button className="menu-card highlight" onClick={onOnline}>
          <span className="menu-icon">🌐</span>
          <span className="menu-title">Play Online</span>
          <span className="menu-desc">Real-time multiplayer. Create a private room or join a public game.</span>
        </button>
      </div>
    </div>
  );
}

// ── Online flow ────────────────────────────────────────────────────────────
export function OnlineScreen({ onBack }: { onBack: () => void }) {
  const net = useNet();
  // In a room (player or spectator) → room view. Otherwise → entry lobby.
  if (net.lobby) return <RoomView onBack={onBack} />;
  return <EntryLobby onBack={onBack} />;
}

function EntryLobby({ onBack }: { onBack: () => void }) {
  const net = useNet();
  const [name, setName] = useState(() => localStorage.getItem("pt-name") || "Player");
  const [tab, setTab] = useState<"create" | "join" | "browse">("create");
  const [roomName, setRoomName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [mode, setMode] = useState<GameMode>("classic");
  const [code, setCode] = useState("");

  useEffect(() => {
    localStorage.setItem("pt-name", name);
  }, [name]);

  useEffect(() => {
    if (tab === "browse") refreshRooms();
  }, [tab]);

  return (
    <div className="setup-screen">
      <button className="btn ghost small back-btn" onClick={onBack}>‹ Back</button>
      <div className="setup-hero compact">
        <div className="hero-emblem">🌐</div>
        <h1>Play <span className="accent">Online</span></h1>
        <ConnStatus />
      </div>

      <div className="setup-card">
        <label className="field">
          Your name
          <input className="seat-name" value={name} maxLength={18} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "create" ? "on" : ""}`} onClick={() => setTab("create")}>Create</button>
        <button className={`tab ${tab === "join" ? "on" : ""}`} onClick={() => setTab("join")}>Join by code</button>
        <button className={`tab ${tab === "browse" ? "on" : ""}`} onClick={() => setTab("browse")}>Public games</button>
      </div>

      {net.error && <div className="net-error">{net.error}</div>}

      {tab === "create" && (
        <div className="setup-card">
          <label className="field">
            Room name
            <input className="seat-name" placeholder="My game" value={roomName} maxLength={24} onChange={(e) => setRoomName(e.target.value)} />
          </label>
          <div className="row">
            <label className="field">
              Mode
              <select value={mode} onChange={(e) => setMode(e.target.value as GameMode)}>
                <option value="classic">Classic</option>
                <option value="timed">Timed</option>
                <option value="quick">Quick</option>
              </select>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              Private (invite-only)
            </label>
          </div>
          <button className="btn primary big" onClick={() => createRoom({ displayName: name, name: roomName, isPrivate, mode })}>
            Create Room
          </button>
        </div>
      )}

      {tab === "join" && (
        <div className="setup-card">
          <label className="field">
            Invite code
            <input
              className="seat-name code-input"
              placeholder="ABC123"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <div className="row">
            <button className="btn primary" disabled={code.length < 4} onClick={() => joinRoom(code, name)}>Join</button>
            <button className="btn ghost" disabled={code.length < 4} onClick={() => spectate(code)}>Spectate</button>
          </div>
        </div>
      )}

      {tab === "browse" && (
        <div className="setup-card">
          <div className="row between">
            <h2>Public games</h2>
            <button className="btn ghost small" onClick={() => refreshRooms()}>↻ Refresh</button>
          </div>
          {net.rooms.length === 0 && <div className="muted">No public games right now. Create one!</div>}
          <div className="room-list">
            {net.rooms.map((r) => (
              <div className="room-row" key={r.roomId}>
                <span className="room-name">{r.name}</span>
                <span className="chip">{r.mode}</span>
                <span className="muted">{r.players}/{r.max}</span>
                <button className="btn primary small" disabled={r.players >= r.max} onClick={() => joinRoom(r.code, name)}>Join</button>
                <button className="btn ghost small" onClick={() => spectate(r.code)}>Watch</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RoomView({ onBack }: { onBack: () => void }) {
  const net = useNet();
  const lobby = net.lobby!;
  const mySeat = lobby.seats.find((s) => s.playerId === net.myPlayerId);
  const isHost = mySeat?.isHost ?? false;
  const isSpectator = net.spectator && !mySeat;
  const [copied, setCopied] = useState(false);

  function copyCode() {
    navigator.clipboard?.writeText(lobby.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="setup-screen">
      <button className="btn ghost small back-btn" onClick={() => { leaveRoom(); onBack(); }}>‹ Leave</button>
      <div className="setup-hero compact">
        <h1>{lobby.name}</h1>
        <button className="invite-code" onClick={copyCode} title="Click to copy">
          Invite code: <strong>{lobby.code}</strong> {copied ? "✓ copied" : "📋"}
        </button>
        {isSpectator && <div className="chip">👀 Spectating</div>}
        {lobby.spectatorCount > 0 && <div className="muted small">{lobby.spectatorCount} watching</div>}
      </div>

      {net.error && <div className="net-error">{net.error}</div>}

      <div className="setup-card">
        <h2>Seats <span className="muted">({lobby.seats.length}/6)</span></h2>
        <div className="seat-list">
          {lobby.seats.map((s) => (
            <div className="seat-row" key={s.index} style={{ borderLeftColor: s.color }}>
              <span className="seat-token">{s.token}</span>
              <span className="seat-name-static">
                {s.displayName}
                {s.playerId === net.myPlayerId && <span className="you-tag"> (you)</span>}
              </span>
              {s.isHost && <span className="chip">host</span>}
              {s.isAI && <span className="pc-ai">{s.aiLevel}</span>}
              {!s.isAI && <span className={`dot ${s.connected ? "on" : "off"}`} title={s.connected ? "connected" : "disconnected"} />}
              {isHost && !s.isHost && (
                <button className="seat-remove" onClick={() => removeSeat(s.index)}>✕</button>
              )}
            </div>
          ))}
        </div>

        {isHost && (
          <div className="host-controls">
            <div className="row">
              <select id="ai-diff" defaultValue="normal" className="seat-diff">
                <option value="easy">Easy AI</option>
                <option value="normal">Normal AI</option>
                <option value="hard">Hard AI</option>
              </select>
              <button
                className="btn ghost"
                disabled={lobby.seats.length >= 6}
                onClick={() => addAI((document.getElementById("ai-diff") as HTMLSelectElement).value as AILevel)}
              >
                + Add AI
              </button>
            </div>
            <label className="field">
              Mode
              <select value={lobby.mode} onChange={(e) => setConfig({ mode: e.target.value as GameMode })}>
                <option value="classic">Classic</option>
                <option value="timed">Timed</option>
                <option value="quick">Quick</option>
              </select>
            </label>
            <button className="btn primary big" disabled={lobby.seats.length < 2} onClick={() => startOnlineGame()}>
              Start Game ▸
            </button>
            {lobby.seats.length < 2 && <div className="muted small">Need at least 2 players (add an AI or invite a friend).</div>}
          </div>
        )}
        {!isHost && !isSpectator && <div className="muted waiting-host">Waiting for the host to start…</div>}
        {isSpectator && <div className="muted waiting-host">Waiting for the game to begin…</div>}
      </div>
    </div>
  );
}

function ConnStatus() {
  const net = useNet();
  const label =
    net.status === "connected" ? "● Connected" : net.status === "connecting" ? "○ Connecting…" : "○ Offline";
  return <div className={`conn ${net.status}`}>{label}</div>;
}
