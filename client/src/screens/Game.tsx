import { useMemo, useState } from "react";
import type { Axis, Grid, LineValues, PublicRoomState } from "@shared/types";
import Coins from "../components/Coins";
import DeductionMatrix from "../components/DeductionMatrix";
import DigitTray from "../components/DigitTray";
import GuessPanel from "../components/GuessPanel";
import LabeledGrid from "../components/LabeledGrid";

type Props = {
  state: PublicRoomState;
  playerId: string;
  busy: boolean;
  error: string | null;
  onGuess: (axis: Axis, index: number, values: LineValues) => void;
  onSolve: (grid: Grid) => void;
  onLeave: () => void;
};

export default function Game({
  state,
  playerId,
  busy,
  error,
  onGuess,
  onSolve,
  onLeave,
}: Props) {
  const [view, setView] = useState<"code" | "notes">("notes");
  const [solveOpen, setSolveOpen] = useState(false);
  const [solveGrid, setSolveGrid] = useState<(number | null)[][]>([
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ]);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>({
    row: 0,
    col: 0,
  });

  const myTurn = state.turnPlayerId === playerId && !state.paused && state.phase === "playing";
  const opponent = state.players.find((p) => p.id !== playerId);

  const used = useMemo(() => {
    const set = new Set<number>();
    for (const row of solveGrid) {
      for (const cell of row) {
        if (cell !== null) set.add(cell);
      }
    }
    return set;
  }, [solveGrid]);

  function placeSolve(digit: number) {
    if (!selected) return;
    setSolveGrid((prev) => {
      const next = prev.map((row) => [...row]);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (next[r][c] === digit) next[r][c] = null;
        }
      }
      next[selected.row][selected.col] = digit;
      return next;
    });
    setSelected((sel) => {
      if (!sel) return { row: 0, col: 0 };
      let r = sel.row;
      let c = sel.col + 1;
      if (c > 2) {
        c = 0;
        r += 1;
      }
      if (r > 2) return sel;
      return { row: r, col: c };
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <div className="panel">
        <div className="legend">
          <span>
            <span className="coin gold" /> Gold = right spot
          </span>
          <span>
            <span className="coin silver" /> Silver = wrong spot
          </span>
        </div>
        <div style={{ height: "0.65rem" }} />
        {state.phase === "finished" ? (
          <div className="banner win">{state.message}</div>
        ) : state.paused ? (
          <div className="banner warn">{state.message}</div>
        ) : myTurn ? (
          <div className="banner">Your turn — guess a line or try to solve</div>
        ) : (
          <div className="banner warn">
            Waiting for {opponent?.name ?? "opponent"}…
          </div>
        )}
        {error ? (
          <>
            <div style={{ height: "0.55rem" }} />
            <div className="error">{error}</div>
          </>
        ) : null}
      </div>

      <div className="toggle" role="tablist">
        <button
          type="button"
          className={view === "notes" ? "active" : ""}
          onClick={() => setView("notes")}
        >
          Notes
        </button>
        <button
          type="button"
          className={view === "code" ? "active" : ""}
          onClick={() => setView("code")}
        >
          My code
        </button>
      </div>

      <div className="panel">
        {view === "code" ? (
          <>
            <h2>Your code</h2>
            {state.yourGrid ? (
              <LabeledGrid values={state.yourGrid} readOnly />
            ) : (
              <p>No code</p>
            )}
          </>
        ) : (
          <>
            <h2>Deduction board</h2>
            <p style={{ marginTop: 0, color: "var(--muted)", fontWeight: 700 }}>
              Cross out numbers that can’t fit each cell.
            </p>
            <DeductionMatrix storageKey={`ofiny_notes_${state.code}_${playerId}`} />
          </>
        )}
      </div>

      {state.phase === "playing" ? (
        <GuessPanel
          disabled={!myTurn || busy}
          onGuess={onGuess}
          onOpenSolve={() => {
            setSolveGrid([
              [null, null, null],
              [null, null, null],
              [null, null, null],
            ]);
            setSelected({ row: 0, col: 0 });
            setSolveOpen(true);
          }}
        />
      ) : null}

      <div className="panel">
        <h2>History</h2>
        {state.history.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)", fontWeight: 700 }}>
            No guesses yet.
          </p>
        ) : (
          <ul className="history">
            {[...state.history].reverse().map((entry) => (
              <li key={entry.id}>
                {entry.kind === "guess" ? (
                  <>
                    <strong>{entry.playerName}</strong> · {entry.label}:{" "}
                    {entry.values.join(" ")}{" "}
                    <Coins gold={entry.gold} silver={entry.silver} />
                  </>
                ) : (
                  <>
                    <strong>{entry.playerName}</strong> tried to solve —{" "}
                    {entry.correct ? "correct!" : "wrong"}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" className="btn btn-ghost" onClick={onLeave}>
        Leave room
      </button>

      {solveOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>
              Solve opponent’s code
            </h2>
            <p style={{ color: "var(--muted)", fontWeight: 700 }}>
              Fill the full 3×3. A wrong solve ends your turn.
            </p>
            <LabeledGrid
              values={solveGrid}
              selected={selected}
              onCellClick={(r, c) => {
                setSelected({ row: r, col: c });
                setSolveGrid((prev) => {
                  const next = prev.map((row) => [...row]);
                  next[r][c] = null;
                  return next;
                });
              }}
            />
            <DigitTray used={used} onPick={placeSolve} />
            <div className="btn-row" style={{ marginTop: "0.9rem" }}>
              <button
                type="button"
                className="btn btn-coral"
                disabled={used.size !== 9 || busy}
                onClick={() => {
                  onSolve(solveGrid as Grid);
                  setSolveOpen(false);
                }}
              >
                Submit solve
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSolveOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
