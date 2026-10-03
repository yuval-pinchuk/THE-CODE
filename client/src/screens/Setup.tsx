import { useMemo, useState } from "react";
import type { Grid, PublicRoomState } from "@shared/types";
import DigitTray from "../components/DigitTray";
import LabeledGrid from "../components/LabeledGrid";

type Props = {
  state: PublicRoomState;
  playerId: string;
  busy: boolean;
  error: string | null;
  onSubmit: (grid: Grid) => void;
};

export default function Setup({ state, playerId, busy, error, onSubmit }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  const [grid, setGrid] = useState<(number | null)[][]>([
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ]);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>({
    row: 0,
    col: 0,
  });

  const used = useMemo(() => {
    const set = new Set<number>();
    for (const row of grid) {
      for (const cell of row) {
        if (cell !== null) set.add(cell);
      }
    }
    return set;
  }, [grid]);

  const complete = used.size === 9;

  function place(digit: number) {
    if (!selected || me?.hasCode) return;
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      // clear if digit already placed elsewhere
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (next[r][c] === digit) next[r][c] = null;
        }
      }
      next[selected.row][selected.col] = digit;
      return next;
    });
    // advance selection
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

  function clearCell(row: number, col: number) {
    if (me?.hasCode) return;
    setSelected({ row, col });
    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = null;
      return next;
    });
  }

  if (me?.hasCode) {
    return (
      <div className="panel">
        <h2>Code locked in</h2>
        {state.yourTargetName ? (
          <p style={{ marginTop: 0, color: "var(--muted)", fontWeight: 700 }}>
            You’ll be solving for <strong>{state.yourTargetName}</strong>.
          </p>
        ) : null}
        <div className="banner">Waiting for everyone to finish their codes…</div>
        {state.yourGrid ? (
          <div style={{ marginTop: "1rem" }}>
            <LabeledGrid values={state.yourGrid} readOnly />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Create your code</h2>
      {state.yourTargetName ? (
        <p style={{ marginTop: 0, color: "var(--navy)", fontWeight: 800 }}>
          You’re solving for {state.yourTargetName}
        </p>
      ) : null}
      <p style={{ marginTop: 0, color: "var(--muted)", fontWeight: 700 }}>
        Place each number 1–9 once on the grid.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {state.paused ? <div className="banner warn">{state.message}</div> : null}
      <LabeledGrid
        values={grid}
        selected={selected}
        onCellClick={(r, c) => clearCell(r, c)}
      />
      <DigitTray used={used} onPick={place} disabled={busy || state.paused} />
      <div style={{ height: "0.85rem" }} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={!complete || busy || state.paused}
        onClick={() => onSubmit(grid as Grid)}
      >
        Lock code
      </button>
    </div>
  );
}
