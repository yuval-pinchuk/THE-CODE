import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Axis, Grid, LineValues, LockedBoard } from "@shared/types";
import { COL_LABELS, ROW_LABELS } from "@shared/types";

export type SolvedLine = {
  id: string;
  axis: Axis;
  index: number;
  values: LineValues;
};

type Props = {
  storageKey: string;
  solvedLines?: SolvedLine[];
  /** Fired (debounced) when committed large digits change, for peer peeks. */
  onLockedChange?: (locked: LockedBoard) => void;
  /** When true and the board has all 9 large digits, show Solve next to Reset. */
  canOfferSolve?: boolean;
  busy?: boolean;
  onSolveBoard?: (grid: Grid) => void;
};

type NotesState = {
  crossed: boolean[][][];
  locked: (number | null)[][];
  appliedSolvedIds: string[];
};

const SOLE_SURVIVOR_MS = 2000;
const LONG_PRESS_MS = 1000;

function defaultCrossed(): boolean[][][] {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => Array.from({ length: 9 }, () => false)),
  );
}

function defaultLocked(): (number | null)[][] {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => null as number | null),
  );
}

function soleSurvivor(cell: boolean[]): number | null {
  const open: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (!cell[i]) open.push(i + 1);
  }
  return open.length === 1 ? open[0] : null;
}

/** Full 3×3 of large digits (locked or sole survivor), or null if incomplete/invalid. */
function completeBoardGrid(notes: NotesState): Grid | null {
  const grid: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const seen = new Set<number>();
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const digit = notes.locked[r][c] ?? soleSurvivor(notes.crossed[r][c]);
      if (digit === null || seen.has(digit)) return null;
      seen.add(digit);
      grid[r][c] = digit;
    }
  }
  return seen.size === 9 ? (grid as Grid) : null;
}

function loadNotes(storageKey: string): NotesState {
  let notes: NotesState;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      notes = { crossed: defaultCrossed(), locked: defaultLocked(), appliedSolvedIds: [] };
    } else {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        notes = {
          crossed: parsed as boolean[][][],
          locked: defaultLocked(),
          appliedSolvedIds: [],
        };
      } else {
        const obj = parsed as Partial<NotesState>;
        notes = {
          crossed: obj.crossed ?? defaultCrossed(),
          locked: obj.locked ?? defaultLocked(),
          appliedSolvedIds: obj.appliedSolvedIds ?? [],
        };
      }
    }
  } catch {
    notes = { crossed: defaultCrossed(), locked: defaultLocked(), appliedSolvedIds: [] };
  }
  cascadeBigDigits(notes);
  return notes;
}

function cloneNotes(prev: NotesState): NotesState {
  return {
    crossed: prev.crossed.map((row) => row.map((cell) => [...cell])),
    locked: prev.locked.map((row) => [...row]),
    appliedSolvedIds: [...prev.appliedSolvedIds],
  };
}

function reconcileLocks(next: NotesState) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const survivor = soleSurvivor(next.crossed[r][c]);
      if (survivor === null) {
        next.locked[r][c] = null;
      } else if (next.locked[r][c] !== null && next.locked[r][c] !== survivor) {
        next.locked[r][c] = null;
      }
    }
  }
}

/** When a cell shows a single digit big, keep that digit exclusive board-wide. */
function promoteBigDigit(next: NotesState, r: number, c: number, digit: number) {
  for (let d = 0; d < 9; d++) {
    next.crossed[r][c][d] = d + 1 !== digit;
  }

  const idx = digit - 1;
  for (let rr = 0; rr < 3; rr++) {
    for (let cc = 0; cc < 3; cc++) {
      if (rr === r && cc === c) continue;
      if (next.locked[rr][cc] === digit) continue;
      next.crossed[rr][cc][idx] = true;
    }
  }
  reconcileLocks(next);
}

function cascadeBigDigits(next: NotesState) {
  for (let pass = 0; pass < 9; pass++) {
    let changed = false;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const digit = next.locked[r][c] ?? soleSurvivor(next.crossed[r][c]);
        if (digit === null) continue;

        let localChange = false;
        for (let d = 0; d < 9; d++) {
          const shouldCross = d + 1 !== digit;
          if (next.crossed[r][c][d] !== shouldCross) {
            next.crossed[r][c][d] = shouldCross;
            localChange = true;
          }
        }

        const idx = digit - 1;
        for (let rr = 0; rr < 3; rr++) {
          for (let cc = 0; cc < 3; cc++) {
            if (rr === r && cc === c) continue;
            if (next.locked[rr][cc] === digit) continue;
            if (!next.crossed[rr][cc][idx]) {
              next.crossed[rr][cc][idx] = true;
              localChange = true;
            }
          }
        }

        if (localChange) {
          reconcileLocks(next);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

function lockCell(next: NotesState, r: number, c: number) {
  const survivor = soleSurvivor(next.crossed[r][c]);
  if (survivor === null) return;
  next.locked[r][c] = survivor;
  promoteBigDigit(next, r, c, survivor);
  cascadeBigDigits(next);
}

function applySolvedToNotes(notes: NotesState, line: SolvedLine): NotesState {
  if (notes.appliedSolvedIds.includes(line.id)) return notes;

  const next = cloneNotes(notes);

  for (let i = 0; i < 3; i++) {
    const r = line.axis === "row" ? line.index : i;
    const c = line.axis === "col" ? line.index : i;
    const value = line.values[i];
    for (let d = 0; d < 9; d++) {
      next.crossed[r][c][d] = d + 1 !== value;
    }
    next.locked[r][c] = value;
    promoteBigDigit(next, r, c, value);
  }
  cascadeBigDigits(next);
  next.appliedSolvedIds.push(line.id);
  return next;
}

export default function DeductionMatrix({
  storageKey,
  solvedLines = [],
  onLockedChange,
  canOfferSolve = false,
  busy = false,
  onSolveBoard,
}: Props) {
  const [notes, setNotes] = useState<NotesState>(() => loadNotes(storageKey));
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null);
  const [holding, setHolding] = useState<{ r: number; c: number; digitIndex: number } | null>(
    null,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ r: number; c: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressDone = useRef(false);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const onLockedChangeRef = useRef(onLockedChange);
  onLockedChangeRef.current = onLockedChange;
  const lastSentLocked = useRef<string>("");

  useEffect(() => {
    setNotes(loadNotes(storageKey));
    setEditing(null);
    setHolding(null);
    clearTimer();
    clearLongPress();
    lastSentLocked.current = "";
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(notes));
  }, [notes, storageKey]);

  useEffect(() => {
    const locked = notes.locked.map((row) => [...row]) as LockedBoard;
    const key = JSON.stringify(locked);
    if (key === lastSentLocked.current) return;
    const t = window.setTimeout(() => {
      lastSentLocked.current = key;
      onLockedChangeRef.current?.(locked);
    }, 250);
    return () => window.clearTimeout(t);
  }, [notes.locked]);

  useEffect(() => {
    if (solvedLines.length === 0) return;
    setNotes((prev) => {
      let next = prev;
      let changed = false;
      for (const line of solvedLines) {
        const applied = applySolvedToNotes(next, line);
        if (applied !== next) {
          next = applied;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setEditing(null);
    clearTimer();
  }, [solvedLines]);

  useEffect(
    () => () => {
      clearTimer();
      clearLongPress();
    },
    [],
  );

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setHolding(null);
  }

  function commitPending(next: NotesState, except?: { r: number; c: number }) {
    const pending = pendingRef.current;
    if (!pending) return;
    if (except && pending.r === except.r && pending.c === except.c) return;
    lockCell(next, pending.r, pending.c);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
  }

  function armPending(r: number, c: number, crossed: boolean[][][], locked: (number | null)[][]) {
    if (soleSurvivor(crossed[r][c]) === null || locked[r][c] !== null) {
      if (pendingRef.current?.r === r && pendingRef.current?.c === c) clearTimer();
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingRef.current = { r, c };
    timerRef.current = setTimeout(() => {
      setNotes((prev) => {
        const next = cloneNotes(prev);
        lockCell(next, r, c);
        return next;
      });
      setEditing((cur) => (cur?.r === r && cur?.c === c ? null : cur));
      pendingRef.current = null;
      timerRef.current = null;
    }, SOLE_SURVIVOR_MS);
  }

  function toggle(r: number, c: number, digitIndex: number) {
    setNotes((prev) => {
      const next = cloneNotes(prev);
      commitPending(next, { r, c });
      next.crossed[r][c][digitIndex] = !next.crossed[r][c][digitIndex];
      reconcileLocks(next);
      const survivor = soleSurvivor(next.crossed[r][c]);
      if (survivor !== null) {
        promoteBigDigit(next, r, c, survivor);
        cascadeBigDigits(next);
      }
      queueMicrotask(() => armPending(r, c, next.crossed, next.locked));
      return next;
    });
    setEditing({ r, c });
  }

  function longPressSelect(r: number, c: number, digitIndex: number) {
    const digit = digitIndex + 1;
    longPressDone.current = true;
    clearLongPress();
    clearTimer();
    setNotes((prev) => {
      const next = cloneNotes(prev);
      commitPending(next, { r, c });
      for (let d = 0; d < 9; d++) {
        next.crossed[r][c][d] = d !== digitIndex;
      }
      next.locked[r][c] = digit;
      promoteBigDigit(next, r, c, digit);
      cascadeBigDigits(next);
      return next;
    });
    setEditing(null);
  }

  function onDigitPointerDown(r: number, c: number, digitIndex: number) {
    longPressDone.current = false;
    clearLongPress();
    setHolding({ r, c, digitIndex });
    longPressTimer.current = setTimeout(() => {
      longPressSelect(r, c, digitIndex);
    }, LONG_PRESS_MS);
  }

  function onDigitPointerEnd() {
    clearLongPress();
  }

  function openBigCell(r: number, c: number) {
    setNotes((prev) => {
      const next = cloneNotes(prev);
      commitPending(next, { r, c });
      next.locked[r][c] = null;
      queueMicrotask(() => armPending(r, c, next.crossed, next.locked));
      return next;
    });
    setEditing({ r, c });
  }

  function focusCell(r: number, c: number) {
    setNotes((prev) => {
      const next = cloneNotes(prev);
      commitPending(next, { r, c });
      return next;
    });
  }

  function reset() {
    clearTimer();
    clearLongPress();
    setEditing(null);
    setNotes({
      crossed: defaultCrossed(),
      locked: defaultLocked(),
      appliedSolvedIds: notesRef.current.appliedSolvedIds,
    });
  }

  useEffect(() => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const survivor = soleSurvivor(notes.crossed[r][c]);
        if (survivor === null || notes.locked[r][c] !== null) continue;
        if (!(pendingRef.current?.r === r && pendingRef.current?.c === c)) {
          armPending(r, c, notes.crossed, notes.locked);
        }
      }
    }
  }, [notes.crossed, notes.locked, editing]);

  function cellMode(r: number, c: number): "big" | "grid" {
    if (editing?.r === r && editing?.c === c) return "grid";
    if (notes.locked[r][c] !== null) return "big";
    if (soleSurvivor(notes.crossed[r][c]) !== null) return "big";
    return "grid";
  }

  function bigDigit(r: number, c: number): number {
    return notes.locked[r][c] ?? soleSurvivor(notes.crossed[r][c]) ?? 0;
  }

  const completeGrid = useMemo(() => completeBoardGrid(notes), [notes]);

  return (
    <div>
      <div className="deduction">
        <div />
        {COL_LABELS.map((label) => (
          <div key={label} className="grid-col-label">
            {label}
          </div>
        ))}
        {ROW_LABELS.map((rowLabel, r) => (
          <Fragment key={rowLabel}>
            <div className="grid-row-label">{rowLabel}</div>
            {COL_LABELS.map((colLabel, c) => {
              const mode = cellMode(r, c);
              if (mode === "big") {
                const digit = bigDigit(r, c);
                const pending = notes.locked[r][c] === null;
                return (
                  <button
                    key={`${rowLabel}${colLabel}`}
                    type="button"
                    className={`deduction-cell deduction-cell-big ${pending ? "pending" : "locked"}`}
                    onClick={() => openBigCell(r, c)}
                    aria-label={`Cell ${rowLabel}${colLabel} is ${digit}. Tap to edit.`}
                  >
                    <span className="deduction-big-digit">{digit}</span>
                  </button>
                );
              }
              return (
                <div
                  key={`${rowLabel}${colLabel}`}
                  className="deduction-cell"
                  onClick={() => focusCell(r, c)}
                >
                  {Array.from({ length: 9 }, (_, i) => {
                    const isHolding =
                      holding?.r === r && holding?.c === c && holding.digitIndex === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`deduction-digit ${notes.crossed[r][c][i] ? "out" : ""} ${isHolding ? "holding" : ""}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          onDigitPointerDown(r, c, i);
                        }}
                        onPointerUp={onDigitPointerEnd}
                        onPointerCancel={onDigitPointerEnd}
                        onLostPointerCapture={onDigitPointerEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (longPressDone.current) {
                            longPressDone.current = false;
                            return;
                          }
                          toggle(r, c, i);
                        }}
                        aria-label={`Toggle ${i + 1} in ${rowLabel}${colLabel}. Hold to lock.`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: "0.75rem" }}>
        <button type="button" className="btn btn-ghost" onClick={reset}>
          Reset notes
        </button>
        {canOfferSolve && completeGrid && onSolveBoard ? (
          <button
            type="button"
            className="btn btn-coral"
            style={{ width: "auto", padding: "0.55rem 1.1rem" }}
            disabled={busy}
            onClick={() => onSolveBoard(completeGrid)}
          >
            Solve
          </button>
        ) : null}
      </div>
    </div>
  );
}
