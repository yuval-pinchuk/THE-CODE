import { useMemo, useState } from "react";
import type { Axis, LineValues } from "@shared/types";
import { COL_LABELS, ROW_LABELS } from "@shared/types";
import DigitTray from "./DigitTray";

type LineChoice = { axis: Axis; index: number; label: string };

const LINE_CHOICES: LineChoice[] = [
  ...COL_LABELS.map((label, index) => ({ axis: "col" as const, index, label })),
  ...ROW_LABELS.map((label, index) => ({ axis: "row" as const, index, label })),
];

type Props = {
  disabled?: boolean;
  onGuess: (axis: Axis, index: number, values: LineValues) => void;
  onOpenSolve: () => void;
};

export default function GuessPanel({ disabled, onGuess, onOpenSolve }: Props) {
  const [line, setLine] = useState<LineChoice | null>(null);
  const [values, setValues] = useState<(number | null)[]>([null, null, null]);

  const used = useMemo(
    () => new Set(values.filter((v): v is number => v !== null)),
    [values],
  );

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
    if (!line || values.some((v) => v === null)) return;
    onGuess(line.axis, line.index, values as LineValues);
    setValues([null, null, null]);
    setLine(null);
  }

  const canGuess = Boolean(line) && values.every((v) => v !== null);

  return (
    <div className="panel">
      <h2>Your move</h2>
      <div className="line-picker">
        {LINE_CHOICES.map((choice) => (
          <button
            key={choice.label}
            type="button"
            className={`chip ${line?.label === choice.label ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => setLine(choice)}
          >
            {choice.label}
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
          disabled={disabled || !canGuess}
          onClick={submit}
        >
          {line ? `Guess ${line.label}` : "Guess"}
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
