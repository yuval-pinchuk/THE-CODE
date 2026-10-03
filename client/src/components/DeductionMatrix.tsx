import { Fragment, useEffect, useRef, useState } from "react";
import type { Axis, LineValues } from "@shared/types";
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
};

type NotesState = {
  crossed: boolean[][][];
  locked: (number | null)[][];
  appliedSolvedIds: string[];
};

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

function loadNotes(storageKey: string): NotesState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return { crossed: defaultCrossed(), locked: defaultLocked(), appliedSolvedIds: [] };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return {
        crossed: parsed as boolean[][][],
        locked: defaultLocked(),
        appliedSolvedIds: [],
      };
    }
    const obj = parsed as Partial<NotesState>;
    return {
      crossed: obj.crossed ?? defaultCrossed(),
      locked: obj.locked ?? defaultLocked(),
      appliedSolvedIds: obj.appliedSolvedIds ?? [],
    };
  } catch {
    return { crossed: defaultCrossed(), locked: defaultLocked(), appliedSolvedIds: [] };
  }
}

function applySolvedToNotes(notes: NotesState, line: SolvedLine): NotesState {
  if (notes.appliedSolvedIds.includes(line.id)) return notes;

  const crossed = notes.crossed.map((row) => row.map((cell) => [...cell]));
  const locked = notes.locked.map((row) => [...row]);

  for (let i = 0; i < 3; i++) {
    const r = line.axis === "row" ? line.index : i;
    const c = line.axis === "col" ? line.index : i;
    const value = line.values[i];
    for (let d = 0; d < 9; d++) {
      crossed[r][c][d] = d + 1 !== value;
    }
    locked[r][c] = value;
  }

  return {
    crossed,
    locked,
    appliedSolvedIds: [...notes.appliedSolvedIds, line.id],
  };
}

function cloneNotes(prev: NotesState): NotesState {
  return {
    crossed: prev.crossed.map((row) => row.map((cell) => [...cell])),
    locked: prev.locked.map((row) => [...row]),
    appliedSolvedIds: [...prev.appliedSolvedIds],
  };
}

export default function DeductionMatrix({ storageKey, solvedLines = [] }: Props) {
  const [notes, setNotes] = useState<NotesState>(() => loadNotes(storageKey));
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ r: number; c: number } | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    setNotes(loadNotes(storageKey));
    setEditing(null);
    clearTimer();
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(notes));
  }, [notes, storageKey]);

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

  useEffect(() => () => clearTimer(), []);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
  }

  function lockCell(next: NotesState, r: number, c: number) {
    const survivor = soleSurvivor(next.crossed[r][c]);
    if (survivor !== null) next.locked[r][c] = survivor;
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
    }, 5000);
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

  function toggle(r: number, c: number, digitIndex: number) {
    setNotes((prev) => {
      const next = cloneNotes(prev);
      commitPending(next, { r, c });
      next.crossed[r][c][digitIndex] = !next.crossed[r][c][digitIndex];
      reconcileLocks(next);
      queueMicrotask(() => armPending(r, c, next.crossed, next.locked));
      return next;
    });
    setEditing({ r, c });
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
    setEditing(null);
    setNotes({
      crossed: defaultCrossed(),
      locked: defaultLocked(),
      appliedSolvedIds: notesRef.current.appliedSolvedIds,
    });
  }

  // Auto-arm pending for sole-survivor cells that aren't locked/editing
  useEffect(() => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const survivor = soleSurvivor(notes.crossed[r][c]);
        const isEditing = editing?.r === r && editing?.c === c;
        if (survivor === null || notes.locked[r][c] !== null) continue;
        if (isEditing) {
          if (!(pendingRef.current?.r === r && pendingRef.current?.c === c)) {
            armPending(r, c, notes.crossed, notes.locked);
          }
          continue;
        }
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
                  {Array.from({ length: 9 }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`deduction-digit ${notes.crossed[r][c][i] ? "out" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(r, c, i);
                      }}
                      aria-label={`Toggle ${i + 1} in ${rowLabel}${colLabel}`}
                    >
                      {i + 1}
                    </button>
                  ))}
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
      </div>
    </div>
  );
}
