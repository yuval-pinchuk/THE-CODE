import { useState } from "react";
import type { GuessHistoryEntry } from "@shared/types";
import type { CoinMarks } from "../notesStorage";
import Coins from "./Coins";

type Props = {
  entry: GuessHistoryEntry;
  marks: CoinMarks;
  onChange: (marks: CoinMarks) => void;
  onClose: () => void;
};

type SlotFocus =
  | { kind: "gold"; index: number }
  | { kind: "silver"; index: number }
  | null;

export default function HistoryCoinMarksModal({
  entry,
  marks,
  onChange,
  onClose,
}: Props) {
  const [focus, setFocus] = useState<SlotFocus>(
    marks.gold.length > 0
      ? { kind: "gold", index: 0 }
      : marks.silver.length > 0
        ? { kind: "silver", index: 0 }
        : null,
  );

  const guessDigits = [...new Set(entry.values)];

  function setMark(kind: "gold" | "silver", index: number, digit: number | null) {
    const next: CoinMarks = {
      gold: [...marks.gold],
      silver: [...marks.silver],
    };
    const list = kind === "gold" ? next.gold : next.silver;
    const current = list[index];
    list[index] = current === digit ? null : digit;
    onChange(next);
  }

  function renderSlot(kind: "gold" | "silver", index: number, digit: number | null) {
    const selected = focus?.kind === kind && focus.index === index;
    return (
      <button
        key={`${kind}-${index}`}
        type="button"
        className={`coin-mark-slot ${kind} ${selected ? "selected" : ""} ${digit !== null ? "filled" : ""}`}
        onClick={() => setFocus({ kind, index })}
        aria-label={`${kind} coin ${index + 1}${digit !== null ? `, marked ${digit}` : ", empty"}`}
      >
        <span className={`coin ${kind} ${digit !== null ? "marked" : ""}`}>
          {digit ?? "?"}
        </span>
      </button>
    );
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Mark coins"
      onClick={onClose}
    >
      <div
        className="modal guess-result-modal coin-marks-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="guess-result-kicker">Your guess</p>
        <h2 className="guess-result-title">
          Line {entry.label}: {entry.values.join(" ")}
        </h2>
        <p className="coin-marks-lead">
          Tap a coin, then pick which digit it was.
        </p>

        <div className="coin-marks-slots" aria-label="Coin slots">
          {marks.gold.map((d, i) => renderSlot("gold", i, d))}
          {marks.silver.map((d, i) => renderSlot("silver", i, d))}
        </div>

        <div className="coin-marks-preview">
          <Coins
            gold={entry.gold}
            silver={entry.silver}
            goldMarks={marks.gold}
            silverMarks={marks.silver}
          />
        </div>

        {focus ? (
          <div className="line-picker coin-marks-digits">
            {guessDigits.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip ${
                  (focus.kind === "gold"
                    ? marks.gold[focus.index]
                    : marks.silver[focus.index]) === d
                    ? "selected"
                    : ""
                }`}
                onClick={() => setMark(focus.kind, focus.index, d)}
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              onClick={() => setMark(focus.kind, focus.index, null)}
            >
              Clear
            </button>
          </div>
        ) : null}

        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
