import { useMemo, useState } from "react";
import type { Axis, LineValues } from "@shared/types";
import { COL_LABELS, ROW_LABELS } from "@shared/types";
import DigitTray from "./DigitTray";

type LineChoice = { axis: Axis; index: number; label: string };

const LINE_CHOICES: LineChoice[] = [
  ...COL_LABELS.map((label, index) => ({ axis: "col" as const, index, label })),
  ...ROW_LABELS.map((label, index) => ({ axis: "row" as const, index, label })),
];

export type QueuedGuess = {
  axis: Axis;
  index: number;
  values: LineValues;
  label: string;
};

type Props = {
  disabled?: boolean;
  /** True when it's this player's turn; otherwise the guess is queued. */
  myTurn: boolean;
  queued: QueuedGuess | null;
  onGuess: (axis: Axis, index: number, values: LineValues) => void;
  onQueue: (guess: QueuedGuess) => void;
  onCancelQueue: () => void;
  onOpenSolve: () => void;
};

export default function GuessPanel({
  disabled,
  myTurn,
  queued,
  onGuess,
  onQueue,
  onCancelQueue,
  onOpenSolve,
}: Props) {
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

  function resetDraft() {
    setValues([null, null, null]);
    setLine(null);
  }

  function submit() {
    if (!line || values.some((v) => v === null)) return;
    if (myTurn) {
      onGuess(line.axis, line.index, values as LineValues);
    } else {
      onQueue({
        axis: line.axis,
        index: line.index,
        label: line.label,
        values: values as LineValues,
      });
    }
    resetDraft();
  }

  function editQueued() {
    if (!queued) return;
    const choice = LINE_CHOICES.find(
      (c) => c.axis === queued.axis && c.index === queued.index,
    );
    setLine(choice ?? null);
    setValues([...queued.values]);
    onCancelQueue();
  }

  const canGuess = Boolean(line) && values.every((v) => v !== null);

  return (
    <div className="panel">
      <h2>{myTurn ? "Your move" : "Plan your move"}</h2>
      {!myTurn ? (
        <p style={{ marginTop: 0, color: "var(--muted)", fontWeight: 700 }}>
          Queue a guess now — it plays automatically on your turn.
        </p>
      ) : null}
      {queued ? (
        <div className="banner queued-guess">
          <span>
            Queued · Line {queued.label}: {queued.values.join(" ")}
          </span>
          <span className="queued-guess-actions">
            <button type="button" className="queued-guess-btn" onClick={editQueued}>
              Edit
            </button>
            <button type="button" className="queued-guess-btn" onClick={onCancelQueue}>
              Cancel
            </button>
          </span>
        </div>
      ) : null}
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
          {myTurn
            ? line
              ? `Guess ${line.label}`
              : "Guess"
            : queued
              ? "Replace queued guess"
              : line
                ? `Queue ${line.label}`
                : "Queue guess"}
        </button>
        {myTurn ? (
          <button
            type="button"
            className="btn btn-coral"
            disabled={disabled}
            onClick={onOpenSolve}
          >
            Solve 3×3
          </button>
        ) : null}
      </div>
    </div>
  );
}
