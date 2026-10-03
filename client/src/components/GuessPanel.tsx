import { useMemo, useState } from "react";
import type { Axis, LineValues } from "@shared/types";
import { COL_LABELS, ROW_LABELS } from "@shared/types";
import DigitTray from "./DigitTray";

type Props = {
  disabled?: boolean;
  onGuess: (axis: Axis, index: number, values: LineValues) => void;
  onOpenSolve: () => void;
};

export default function GuessPanel({ disabled, onGuess, onOpenSolve }: Props) {
  const [axis, setAxis] = useState<Axis>("row");
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<(number | null)[]>([null, null, null]);

  const used = useMemo(
    () => new Set(values.filter((v): v is number => v !== null)),
    [values],
  );

  const labels = axis === "row" ? ROW_LABELS : COL_LABELS;

  function pickDigit(d: number) {
    setValues((prev) => {
      const next = [...prev];
      const empty = next.findIndex((v) => v === null);
      if (empty === -1) return prev;
      next[empty] = d;
      return next;
    });
  }

  function clearSlot(i: number) {
    setValues((prev) => {
      const next = [...prev];
      next[i] = null;
      return next;
    });
  }

  function submit() {
    if (values.some((v) => v === null)) return;
    onGuess(axis, index, values as LineValues);
    setValues([null, null, null]);
  }

  return (
    <div className="panel">
      <h2>Your move</h2>
      <div className="line-picker">
        {(["row", "col"] as Axis[]).map((a) => (
          <button
            key={a}
            type="button"
            className={`chip ${axis === a ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => {
              setAxis(a);
              setIndex(0);
            }}
          >
            {a === "row" ? "Row" : "Column"}
          </button>
        ))}
      </div>
      <div className="line-picker">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`chip ${index === i ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => setIndex(i)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="guess-slots">
        {values.map((v, i) => (
          <button
            key={i}
            type="button"
            className={`guess-slot ${v ? "filled" : ""}`}
            disabled={disabled}
            onClick={() => clearSlot(i)}
          >
            {v ?? "·"}
          </button>
        ))}
      </div>

      <DigitTray used={used} onPick={pickDigit} disabled={disabled} />

      <div className="btn-row" style={{ marginTop: "0.9rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || values.some((v) => v === null)}
          onClick={submit}
        >
          Guess {labels[index]}
        </button>
        <button
          type="button"
          className="btn btn-coral"
          disabled={disabled}
          onClick={onOpenSolve}
        >
          Solve 3×3
        </button>
      </div>
    </div>
  );
}
