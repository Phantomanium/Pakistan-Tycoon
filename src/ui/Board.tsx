import { BOARD, GROUP_COLORS } from "../game/board";
import { pkrShort } from "../game/format";
import type { GameState } from "../game/types";

const STAGE_ICON = ["", "🏪", "🏬", "🏢", "🏙️"];

/** Map a board position (0–39) to an 11×11 CSS grid cell. */
function gridCell(pos: number): { row: number; col: number } {
  if (pos <= 10) return { row: 11, col: 11 - pos }; // bottom row (GO → Jail)
  if (pos <= 20) return { row: 21 - pos, col: 1 }; // left column (→ Free Parking)
  if (pos <= 30) return { row: 1, col: pos - 19 }; // top row (→ Go To Jail)
  return { row: pos - 29, col: 11 }; // right column (→ GO)
}

const SPECIAL_ICON: Record<string, string> = {
  go: "➡️",
  jail: "🔒",
  gotojail: "🚔",
  parking: "☕",
  tax: "🧾",
  luxury: "💎",
  chance: "🎲",
  chest: "🎁",
  airport: "✈️",
  utility: "🔌",
};

export default function Board({
  game,
  onTile,
  rolling,
  canRoll,
  onRoll,
}: {
  game: GameState;
  onTile: (pos: number) => void;
  rolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
}) {
  const cur = game.players[game.currentIndex];
  return (
    <div className="board">
      {BOARD.map((space) => {
        const { row, col } = gridCell(space.pos);
        const prop = game.properties[space.pos];
        const owner = prop?.ownerId ? game.players.find((p) => p.id === prop.ownerId) : null;
        const here = game.players.filter((p) => p.position === space.pos && !p.bankrupt);
        const curHere = here.some((p) => p.id === cur.id);
        const isCorner = space.pos % 10 === 0;
        const groupColor =
          space.type === "city" && space.group ? GROUP_COLORS[space.group] : undefined;
        return (
          <button
            key={space.pos}
            className={`tile ${isCorner ? "corner" : ""} type-${space.type} ${owner ? "owned" : ""}`}
            style={{
              gridRow: row,
              gridColumn: col,
              ...(owner ? ({ "--owner": owner.color } as React.CSSProperties) : {}),
            }}
            onClick={() => onTile(space.pos)}
            title={space.name}
          >
            {groupColor && <span className="tile-band" style={{ background: groupColor }} />}
            <span className="tile-body">
              {space.type !== "city" && (
                <span className="tile-icon">{SPECIAL_ICON[space.type]}</span>
              )}
              <span className="tile-name">{space.name}</span>
              {space.price != null && (
                <span className="tile-price">{pkrShort(space.price)}</span>
              )}
              {prop?.mortgaged && <span className="tile-mortgaged">MORTGAGED</span>}
              {space.type === "city" && prop && prop.stage > 0 && (
                <span className="tile-stage">{STAGE_ICON[prop.stage].repeat(1)}<small>{prop.stage}</small></span>
              )}
            </span>

            {owner && (
              <span
                className="tile-owner-dot"
                style={{ background: owner.color }}
                title={`Owned by ${owner.name}`}
              >
                <span className="tod-token">{owner.token}</span>
              </span>
            )}

            {curHere && (
              <span className="turn-arrow" style={{ color: cur.color }} aria-hidden>
                ▾
              </span>
            )}

            {here.length > 0 && (
              <span className="tile-tokens">
                {here.map((p) => (
                  <span
                    key={p.id}
                    className={`tok ${p.id === cur.id ? "active" : ""} ${
                      rolling && p.id === cur.id ? "hop" : ""
                    }`}
                    style={{ background: p.color, "--tok": p.color } as React.CSSProperties}
                    title={p.name}
                  >
                    <span className="tok-glyph">{p.token}</span>
                  </span>
                ))}
              </span>
            )}
          </button>
        );
      })}

      <BoardCenter game={game} rolling={rolling} canRoll={canRoll} onRoll={onRoll} />
    </div>
  );
}

function BoardCenter({
  game,
  rolling,
  canRoll,
  onRoll,
}: {
  game: GameState;
  rolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
}) {
  const cur = game.players[game.currentIndex];
  const event = game.modifiers[game.modifiers.length - 1];
  const lastLog = game.log[game.log.length - 1];
  const canClickRoll = canRoll && game.phase === "preRoll" && !cur.inJail && !rolling;

  return (
    <div className="board-center">
      <div className="center-logo">
        <span className="center-emblem">🕌</span>
        <span className="center-title">PAKISTAN TYCOON</span>
        <span className="center-sub">Property Empire of Pakistan</span>
      </div>

      <div
        className={`dice-area ${rolling ? "rolling" : ""} ${canClickRoll ? "clickable" : ""}`}
        onClick={canClickRoll ? onRoll : undefined}
        role={canClickRoll ? "button" : undefined}
        title={canClickRoll ? "Click to roll the dice" : undefined}
      >
        <Die value={game.dice?.[0] ?? 1} rolling={rolling} />
        <Die value={game.dice?.[1] ?? 1} rolling={rolling} />
      </div>
      {canClickRoll && <div className="dice-hint">🎲 tap the dice to roll</div>}

      <div className="center-turn" style={{ borderColor: cur.color }}>
        <span className="ct-dot" style={{ background: cur.color }} />
        <span className="ct-name">{cur.name}</span>
        <span className="ct-phase">
          {game.phase === "preRoll" ? (cur.inJail ? "In Central Lockup" : "to roll") : game.phase === "auction" ? "Auction!" : "managing"}
        </span>
      </div>

      {lastLog && (
        <div key={lastLog.id} className={`center-log k-${lastLog.kind}`}>
          {lastLog.text}
        </div>
      )}

      {event && (
        <div className="center-event">
          📰 <strong>{event.name}</strong> · {event.desc} <em>({event.roundsLeft} round{event.roundsLeft > 1 ? "s" : ""} left)</em>
        </div>
      )}
    </div>
  );
}

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  const pips = PIPS[value] ?? PIPS[1];
  return (
    <div className={`die ${rolling ? "spin" : ""}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={`pip ${pips.includes(i) ? "on" : ""}`} />
      ))}
    </div>
  );
}

// pip positions in a 3×3 grid (index 0–8)
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
