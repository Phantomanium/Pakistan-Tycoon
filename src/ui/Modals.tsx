import { useMemo, useState } from "react";
import {
  AIRPORT_BASE_RENT,
  BOARD,
  GROUP_COLORS,
  GROUP_LABELS,
  GROUP_POSITIONS,
  OWNABLE_POSITIONS,
} from "../game/board";
import {
  auctionBidder,
  canDevelop,
  canMortgage,
  canSellDevelopment,
  canUnmortgage,
  computeRent,
  currentPlayer,
  netWorth,
} from "../game/engine";
import { pkr } from "../game/format";
import { send } from "../store";
import type { GameState } from "../game/types";

const STAGE_NAMES = ["Empty Plot", "Shop", "Plaza", "Commercial Complex", "Corporate Tower"];

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Property detail + management ───────────────────────────────────────────
export function PropertyModal({
  game,
  pos,
  canAct,
  onClose,
}: {
  game: GameState;
  pos: number;
  canAct: boolean;
  onClose: () => void;
}) {
  const space = BOARD[pos];
  const prop = game.properties[pos];
  const owner = prop?.ownerId ? game.players.find((p) => p.id === prop.ownerId) : null;
  const cur = currentPlayer(game);
  const isMine = prop?.ownerId === cur.id && canAct;
  const groupColor = space.group ? GROUP_COLORS[space.group] : "#888";

  const airportRents = [1, 2, 4, 8].map((m) => AIRPORT_BASE_RENT * m);

  return (
    <Backdrop onClose={onClose}>
      <div className="pcard" style={{ "--gc": groupColor } as React.CSSProperties}>
        <div className="pcard-top" style={{ background: groupColor }} />
        <div className="pcard-head">
          {space.group && (
            <span className="pcard-group" style={{ background: groupColor }}>
              {GROUP_LABELS[space.group]}
            </span>
          )}
          <h2 className="pcard-title">{space.name}</h2>
          {prop?.ownerId && owner ? (
            <div className="pcard-owner">
              <span className="od" style={{ background: owner.color }} />
              {owner.name}
              {prop.mortgaged && " · mortgaged"}
              {space.type === "city" && prop.stage > 0 && ` · ${STAGE_NAMES[prop.stage]}`}
            </div>
          ) : space.price != null ? (
            <div className="pcard-owner muted">Unowned</div>
          ) : null}
        </div>

        {space.bonus && <p className="pcard-bonus">✨ {space.bonus}</p>}

        {space.type === "city" && (
          <div className="rent-rows">
            <div className="rent-row head">
              <span className="rr-when">when</span>
              <span className="rr-get">get</span>
            </div>
            {STAGE_NAMES.map((name, i) => (
              <div key={i} className={`rent-row ${prop && prop.stage === i ? "active" : ""}`}>
                <span className="rr-when">
                  {i === 0 ? "with rent" : `with ${name}`}
                </span>
                <span className="rr-get">{pkr(space.rent![i])}</span>
              </div>
            ))}
            <div className="rent-note">Base rent doubles with a full colour set.</div>
          </div>
        )}

        {space.type === "airport" && (
          <div className="rent-rows">
            <div className="rent-row head">
              <span className="rr-when">when</span>
              <span className="rr-get">get</span>
            </div>
            {airportRents.map((r, i) => (
              <div key={i} className="rent-row">
                <span className="rr-when">{i + 1} airport{i > 0 ? "s" : ""} owned</span>
                <span className="rr-get">{pkr(r)}</span>
              </div>
            ))}
          </div>
        )}

        {space.type === "utility" && (
          <div className="rent-rows">
            <div className="rent-row"><span className="rr-when">with 1 utility</span><span className="rr-get">dice × 4</span></div>
            <div className="rent-row"><span className="rr-when">with both utilities</span><span className="rr-get">dice × 10</span></div>
          </div>
        )}

        <div className="pcard-foot">
          {space.price != null && (
            <div><span className="pcf-lbl">Price</span><span className="pcf-val">{pkr(space.price)}</span></div>
          )}
          {space.buildCost != null && (
            <div><span className="pcf-lbl">🏗️ Build</span><span className="pcf-val">{pkr(space.buildCost)}</span></div>
          )}
          {space.mortgage != null && (
            <div><span className="pcf-lbl">💱 Mortgage</span><span className="pcf-val">{pkr(space.mortgage)}</span></div>
          )}
          {space.amount != null && (
            <div><span className="pcf-lbl">Pay</span><span className="pcf-val">{pkr(space.amount)}</span></div>
          )}
        </div>

        {isMine && (
          <div className="prop-actions">
            {space.type === "city" && (
              <>
                <button className="btn good" disabled={!canDevelop(game, pos)} onClick={() => send({ t: "develop", pos })}>
                  ⬆️ Develop {space.buildCost != null ? `(${pkr(space.buildCost)})` : ""}
                </button>
                <button className="btn" disabled={!canSellDevelopment(game, pos)} onClick={() => send({ t: "sellDev", pos })}>
                  ⬇️ Sell stage
                </button>
              </>
            )}
            {!prop?.mortgaged ? (
              <button className="btn warn" disabled={!canMortgage(game, pos)} onClick={() => send({ t: "mortgage", pos })}>
                💱 Mortgage ({pkr(space.mortgage ?? 0)})
              </button>
            ) : (
              <button className="btn" disabled={!canUnmortgage(game, pos)} onClick={() => send({ t: "unmortgage", pos })}>
                🔓 Unmortgage ({pkr(Math.round((space.mortgage ?? 0) * 1.1))})
              </button>
            )}
          </div>
        )}
        <button className="btn ghost full" onClick={onClose}>Close</button>
      </div>
    </Backdrop>
  );
}

// ── Auction ──────────────────────────────────────────────────────────────
export function AuctionModal({ game, myId, online }: { game: GameState; myId: string | null; online: boolean }) {
  const a = game.auction!;
  const space = BOARD[a.pos];
  const bidder = auctionBidder(game);
  const human = bidder && !bidder.isAI && (!online || bidder.id === myId);
  const min = a.highBid === 0 ? 100_000 : a.highBid + 100_000;
  const [bid, setBid] = useState(min);
  const realMin = a.highBid === 0 ? 100_000 : a.highBid + 100_000;

  return (
    <Backdrop onClose={() => {}}>
      <div className="auction-modal">
        <h2>🔨 Auction</h2>
        <div className="auction-prop" style={{ borderColor: space.group ? GROUP_COLORS[space.group] : "#888" }}>
          {space.name}
        </div>
        <div className="auction-bid">
          High bid: <strong>{a.highBid > 0 ? pkr(a.highBid) : "—"}</strong>
          {a.highBidderId && <> by {game.players.find((p) => p.id === a.highBidderId)!.name}</>}
        </div>
        <div className="auction-active">
          {a.active.map((id, i) => {
            const p = game.players.find((pl) => pl.id === id)!;
            return (
              <span key={id} className={`auc-chip ${i === a.turnIndex ? "turn" : ""}`} style={{ borderColor: p.color }}>
                {p.token} {p.name}
              </span>
            );
          })}
        </div>
        {human ? (
          <div className="auction-controls">
            <input
              type="range"
              min={realMin}
              max={bidder!.cash}
              step={100_000}
              value={Math.max(realMin, Math.min(bid, bidder!.cash))}
              onChange={(e) => setBid(Number(e.target.value))}
            />
            <div className="auction-amt">{pkr(Math.max(realMin, Math.min(bid, bidder!.cash)))}</div>
            <div className="auction-buttons">
              <button
                className="btn primary"
                disabled={realMin > bidder!.cash}
                onClick={() => send({ t: "placeBid", playerId: bidder!.id, amount: Math.max(realMin, Math.min(bid, bidder!.cash)) })}
              >
                Bid
              </button>
              <button className="btn" onClick={() => send({ t: "passBid", playerId: bidder!.id })}>Pass</button>
            </div>
          </div>
        ) : (
          <div className="thinking center"><span className="spinner" /> {bidder?.name} is bidding…</div>
        )}
      </div>
    </Backdrop>
  );
}

// ── Trade composer ─────────────────────────────────────────────────────────
function isTradable(game: GameState, pos: number, ownerId: string): boolean {
  const prop = game.properties[pos];
  if (prop.ownerId !== ownerId) return false;
  const space = BOARD[pos];
  if (space.type === "city" && GROUP_POSITIONS[space.group!].some((g) => game.properties[g].stage > 0))
    return false;
  return true;
}

export function TradeModal({ game, onClose }: { game: GameState; onClose: () => void }) {
  const me = currentPlayer(game);
  const others = game.players.filter((p) => p.id !== me.id && !p.bankrupt);
  const [targetId, setTargetId] = useState(others[0]?.id ?? "");
  const [giveProps, setGiveProps] = useState<number[]>([]);
  const [wantProps, setWantProps] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState(0);
  const [wantCash, setWantCash] = useState(0);

  const myProps = OWNABLE_POSITIONS.filter((pos) => isTradable(game, pos, me.id));
  const theirProps = useMemo(
    () => OWNABLE_POSITIONS.filter((pos) => targetId && isTradable(game, pos, targetId)),
    [game, targetId]
  );

  if (!others.length) {
    return (
      <Backdrop onClose={onClose}>
        <div className="trade-modal"><h2>Trade</h2><p>No one to trade with.</p><button className="btn ghost full" onClick={onClose}>Close</button></div>
      </Backdrop>
    );
  }

  function toggle(list: number[], set: (v: number[]) => void, pos: number) {
    set(list.includes(pos) ? list.filter((p) => p !== pos) : [...list, pos]);
  }

  function submit() {
    send({
      t: "proposeTrade",
      proposal: { fromId: me.id, toId: targetId, giveCash, giveProps, wantCash, wantProps },
    });
    onClose();
  }

  return (
    <Backdrop onClose={onClose}>
      <div className="trade-modal">
        <h2>🤝 Propose a Trade</h2>
        <label className="trade-target">
          With:
          <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setWantProps([]); }}>
            {others.map((p) => (
              <option key={p.id} value={p.id}>{p.token} {p.name}</option>
            ))}
          </select>
        </label>
        <div className="trade-cols">
          <div className="trade-col">
            <h3>You give</h3>
            <CashInput value={giveCash} max={me.cash} onChange={setGiveCash} />
            <PropPicker game={game} positions={myProps} selected={giveProps} onToggle={(pos) => toggle(giveProps, setGiveProps, pos)} />
          </div>
          <div className="trade-col">
            <h3>You receive</h3>
            <CashInput value={wantCash} max={game.players.find((p) => p.id === targetId)?.cash ?? 0} onChange={setWantCash} />
            <PropPicker game={game} positions={theirProps} selected={wantProps} onToggle={(pos) => toggle(wantProps, setWantProps, pos)} />
          </div>
        </div>
        <div className="trade-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={giveCash + giveProps.length === 0 && wantCash + wantProps.length === 0}
            onClick={submit}
          >
            Send Offer
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function CashInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="cash-input">
      <span>Rs.</span>
      <input
        type="number"
        min={0}
        max={max}
        step={100_000}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
      />
    </div>
  );
}

function PropPicker({
  game,
  positions,
  selected,
  onToggle,
}: {
  game: GameState;
  positions: number[];
  selected: number[];
  onToggle: (pos: number) => void;
}) {
  return (
    <div className="prop-picker">
      {positions.length === 0 && <div className="muted small">No tradable properties.</div>}
      {positions.map((pos) => {
        const space = BOARD[pos];
        return (
          <label key={pos} className={`pp-item ${selected.includes(pos) ? "on" : ""}`}>
            <input type="checkbox" checked={selected.includes(pos)} onChange={() => onToggle(pos)} />
            <span className="pp-dot" style={{ background: space.group ? GROUP_COLORS[space.group] : "#999" }} />
            {space.name}
          </label>
        );
      })}
    </div>
  );
}

// ── Incoming trade (when a human is the recipient, e.g. hot-seat) ───────────
export function IncomingTradeModal({ game }: { game: GameState }) {
  const t = game.trade!;
  const from = game.players.find((p) => p.id === t.fromId)!;
  const to = game.players.find((p) => p.id === t.toId)!;
  return (
    <Backdrop onClose={() => {}}>
      <div className="trade-modal">
        <h2>🤝 Trade offer for {to.name}</h2>
        <p className="muted">{from.token} {from.name} proposes:</p>
        <div className="trade-summary">
          <div>
            <strong>{to.name} receives:</strong>
            <ul>
              {t.giveCash > 0 && <li>{pkr(t.giveCash)}</li>}
              {t.giveProps.map((p) => <li key={p}>{BOARD[p].name}</li>)}
              {t.giveCash === 0 && t.giveProps.length === 0 && <li className="muted">nothing</li>}
            </ul>
          </div>
          <div>
            <strong>{to.name} gives:</strong>
            <ul>
              {t.wantCash > 0 && <li>{pkr(t.wantCash)}</li>}
              {t.wantProps.map((p) => <li key={p}>{BOARD[p].name}</li>)}
              {t.wantCash === 0 && t.wantProps.length === 0 && <li className="muted">nothing</li>}
            </ul>
          </div>
        </div>
        <div className="trade-actions">
          <button className="btn warn" onClick={() => send({ t: "respondTrade", accept: false })}>Decline</button>
          <button className="btn primary" onClick={() => send({ t: "respondTrade", accept: true })}>Accept</button>
        </div>
      </div>
    </Backdrop>
  );
}

// ── Game over ──────────────────────────────────────────────────────────────
export function GameOverModal({ game, onExit }: { game: GameState; onExit: () => void }) {
  const ranked = [...game.players].sort((a, b) => netWorth(game, b) - netWorth(game, a));
  const winner = game.players.find((p) => p.id === game.winnerId);
  return (
    <Backdrop onClose={() => {}}>
      <div className="gameover-modal">
        <div className="trophy">🏆</div>
        <h2>{winner ? `${winner.token} ${winner.name} wins!` : "Game Over"}</h2>
        <table className="rank-table">
          <tbody>
            {ranked.map((p, i) => (
              <tr key={p.id} className={p.id === game.winnerId ? "winner" : p.bankrupt ? "out" : ""}>
                <td>{i + 1}</td>
                <td>{p.token} {p.name}</td>
                <td>{pkr(netWorth(game, p))}</td>
                <td>{p.bankrupt ? "bankrupt" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn primary big full" onClick={onExit}>Back to Menu</button>
      </div>
    </Backdrop>
  );
}

// ── Card / event toast ─────────────────────────────────────────────────────
export function Toast({ text, kind, onClose }: { text: string; kind: string; onClose: () => void }) {
  return (
    <div className={`toast k-${kind}`} onClick={onClose}>
      <div className="toast-icon">{kind === "event" ? "📰" : "🃏"}</div>
      <div className="toast-text">{text}</div>
    </div>
  );
}
