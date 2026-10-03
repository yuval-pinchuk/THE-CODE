import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Axis,
  Grid,
  GuessHistoryEntry,
  LineValues,
  PublicRoomState,
} from "@shared/types";
import AssignmentCircle from "../components/AssignmentCircle";
import Coins from "../components/Coins";
import DeductionMatrix, { type SolvedLine } from "../components/DeductionMatrix";
import DigitTray from "../components/DigitTray";
import GuessPanel from "../components/GuessPanel";
import LabeledGrid from "../components/LabeledGrid";
import SolveCelebration from "../components/SolveCelebration";
import { notesStorageKey } from "../notesStorage";
import { updateLockedBoard } from "../socket";

type Props = {
  state: PublicRoomState;
  playerId: string;
  busy: boolean;
  error: string | null;
  onGuess: (axis: Axis, index: number, values: LineValues) => void;
  onSolve: (grid: Grid) => void;
  onRestart: () => void;
  onLeave: () => void;
};

export default function Game({
  state,
  playerId,
  busy,
  error,
  onGuess,
  onSolve,
  onRestart,
  onLeave,
}: Props) {
  const [view, setView] = useState<"code" | "notes">("notes");
  const [solveOpen, setSolveOpen] = useState(false);
  const [circleOpen, setCircleOpen] = useState(false);
  const [guessPopup, setGuessPopup] = useState<GuessHistoryEntry | null>(null);
  const [wrongSolveFlash, setWrongSolveFlash] = useState(false);
  const [dismissedCelebrationKey, setDismissedCelebrationKey] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [solveGrid, setSolveGrid] = useState<(number | null)[][]>([
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ]);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>({
    row: 0,
    col: 0,
  });
  const seenHistoryId = useRef<string | null | undefined>(undefined);

  const me = state.players.find((p) => p.id === playerId);
  const hasSolved = Boolean(me?.hasSolved);
  const celebrationKey = state.celebration
    ? state.celebration.id ||
      `${state.celebration.solverId}:${state.celebration.targetId}`
    : null;
  const showCelebration = Boolean(
    celebrationKey && celebrationKey !== dismissedCelebrationKey,
  );
  const myTurn =
    state.turnPlayerId === playerId &&
    !state.paused &&
    state.phase === "playing" &&
    !hasSolved &&
    !me?.wantsRestart &&
    !showCelebration;
  const turnPlayer = state.players.find((p) => p.id === state.turnPlayerId);

  const solvedLines = useMemo<SolvedLine[]>(
    () =>
      state.history
        .filter(
          (entry): entry is GuessHistoryEntry & { kind: "guess" } =>
            entry.kind === "guess" &&
            entry.playerId === playerId &&
            entry.gold === 3,
        )
        .map((entry) => ({
          id: entry.id,
          axis: entry.axis,
          index: entry.index,
          values: entry.values,
        })),
    [state.history, playerId],
  );

  const filteredHistory = useMemo(() => {
    const list = [...state.history].reverse();
    if (historyFilter === "all") return list;
    return list.filter((e) => e.playerId === historyFilter);
  }, [state.history, historyFilter]);

  useEffect(() => {
    const last = state.history[state.history.length - 1];
    if (!last) {
      seenHistoryId.current = null;
      return;
    }
    if (seenHistoryId.current === undefined) {
      seenHistoryId.current = last.id;
      return;
    }
    if (last.id === seenHistoryId.current) return;
    seenHistoryId.current = last.id;
    if (last.kind === "guess" && !showCelebration) {
      setGuessPopup(last);
      setSolveOpen(false);
    }
    if (
      last.kind === "solve" &&
      !last.correct &&
      last.playerId === playerId &&
      !showCelebration
    ) {
      setSolveOpen(false);
      setWrongSolveFlash(true);
    }
  }, [state.history, showCelebration, playerId]);

  useEffect(() => {
    if (!wrongSolveFlash) return;
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate([40, 40, 80]);
    }
    const t = window.setTimeout(() => setWrongSolveFlash(false), 1400);
    return () => window.clearTimeout(t);
  }, [wrongSolveFlash]);

  useEffect(() => {
    if (!myTurn) setSolveOpen(false);
  }, [myTurn]);

  useEffect(() => {
    if (showCelebration) setGuessPopup(null);
  }, [showCelebration]);

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
        {state.yourTargetName ? (
          <button
            type="button"
            className="target-chip"
            onClick={() => setCircleOpen(true)}
          >
            <strong>{state.yourTargetName}</strong> is your target
          </button>
        ) : null}
        <div className="legend">
          <span>
            <span className="coin gold" /> Gold = right spot
          </span>
          <span>
            <span className="coin silver" /> Silver = wrong spot
          </span>
        </div>
        <div style={{ height: "0.65rem" }} />
        {state.paused ? (
          <div className="banner warn">{state.message}</div>
        ) : hasSolved ? (
          <div className="banner win">
            {state.message ?? "You solved your target — waiting for others…"}
          </div>
        ) : myTurn ? (
          <div className="banner">Your turn — guess a line or try to solve</div>
        ) : (
          <div className="banner warn">
            Waiting for {turnPlayer?.name ?? "next player"}…
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
              Cross out numbers that can’t fit {state.yourTargetName ?? "your target"}’s
              cells.
            </p>
            <DeductionMatrix
              storageKey={notesStorageKey(
                state.code,
                playerId,
                state.roundId ?? "none",
              )}
              solvedLines={solvedLines}
              onLockedChange={(locked) => {
                void updateLockedBoard({ locked });
              }}
              canOfferSolve={myTurn}
              busy={busy}
              onSolveBoard={onSolve}
            />
          </>
        )}
      </div>

      {state.phase === "playing" && myTurn ? (
        <GuessPanel
          disabled={busy}
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
          <>
            <div className="line-picker history-filter">
              <button
                type="button"
                className={`chip ${historyFilter === "all" ? "selected" : ""}`}
                onClick={() => setHistoryFilter("all")}
              >
                All
              </button>
              {state.players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip ${historyFilter === p.id ? "selected" : ""}`}
                  onClick={() => setHistoryFilter(p.id)}
                >
                  {p.id === playerId ? "You" : p.name}
                </button>
              ))}
            </div>
            {filteredHistory.length === 0 ? (
              <p style={{ margin: 0, color: "var(--muted)", fontWeight: 700 }}>
                No moves for this filter.
              </p>
            ) : (
              <ul className="history">
                {filteredHistory.map((entry) => (
                  <li key={entry.id}>
                    {entry.kind === "guess" ? (
                      <>
                        <strong>{entry.playerName}</strong> · {entry.label}:{" "}
                        {entry.values.join(" ")}{" "}
                        <Coins gold={entry.gold} silver={entry.silver} />
                      </>
                    ) : (
                      <>
                        <strong>{entry.playerName}</strong> tried to solve{" "}
                        {entry.targetName}’s code —{" "}
                        {entry.correct ? "correct!" : "wrong"}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        className="btn btn-coral"
        disabled={busy || me?.wantsRestart}
        onClick={onRestart}
      >
        Restart
      </button>
      <button type="button" className="btn btn-ghost" onClick={onLeave} disabled={busy}>
        Leave room
      </button>

      {solveOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>
              Solve {state.yourTargetName ?? "target"}’s code
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

      {wrongSolveFlash ? (
        <div
          className="modal-backdrop wrong-solve-backdrop"
          role="status"
          aria-live="assertive"
          aria-label="Wrong solve"
          onClick={() => setWrongSolveFlash(false)}
        >
          <div className="wrong-solve-burst">
            <svg
              className="wrong-solve-x"
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <path className="wrong-solve-arm wrong-solve-arm-a" d="M22 22 L78 78" />
              <path className="wrong-solve-arm wrong-solve-arm-b" d="M78 22 L22 78" />
            </svg>
            <p className="wrong-solve-label">Wrong</p>
          </div>
        </div>
      ) : null}

      {guessPopup && !showCelebration ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Guess result"
          onClick={() => setGuessPopup(null)}
        >
          <div
            className="modal guess-result-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="guess-result-kicker">
              {guessPopup.playerId === playerId ? "Your guess" : `${guessPopup.playerName} guessed`}
            </p>
            <h2 className="guess-result-title">
              Line {guessPopup.label}
            </h2>
            <div className="guess-result-digits" aria-label={`Guess ${guessPopup.values.join(" ")}`}>
              {guessPopup.values.map((v, i) => (
                <span key={i} className="guess-result-digit">
                  {v}
                </span>
              ))}
            </div>
            <div className="guess-result-coins">
              <Coins gold={guessPopup.gold} silver={guessPopup.silver} />
            </div>
            <p className="guess-result-summary">
              {guessPopup.gold} gold · {guessPopup.silver} silver
              {guessPopup.gold === 0 && guessPopup.silver === 0 ? " · miss" : ""}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setGuessPopup(null)}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {circleOpen ? (
        <AssignmentCircle
          players={state.players}
          assignments={state.assignments}
          viewerId={playerId}
          yourTargetId={state.yourTargetId}
          playerLockedBoards={state.playerLockedBoards ?? {}}
          onClose={() => setCircleOpen(false)}
        />
      ) : null}

      {showCelebration && state.celebration && celebrationKey ? (
        <SolveCelebration
          celebration={state.celebration}
          viewerId={playerId}
          busy={busy}
          canContinue={state.players.some(
            (p) => !p.hasSolved && !p.wantsRestart,
          )}
          onContinue={() => setDismissedCelebrationKey(celebrationKey)}
          onRestart={() => {
            setDismissedCelebrationKey(celebrationKey);
            onRestart();
          }}
          onLeave={onLeave}
        />
      ) : null}
    </div>
  );
}
