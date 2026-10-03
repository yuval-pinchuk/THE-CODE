import { Fragment, useEffect, useState } from "react";
import { COL_LABELS, ROW_LABELS } from "@shared/types";

type Props = {
  storageKey: string;
};

function defaultMarks(): boolean[][][] {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => Array.from({ length: 9 }, () => false)),
  );
}

export default function DeductionMatrix({ storageKey }: Props) {
  const [crossed, setCrossed] = useState<boolean[][][]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as boolean[][][];
    } catch {
      /* ignore */
    }
    return defaultMarks();
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(crossed));
  }, [crossed, storageKey]);

  function toggle(r: number, c: number, digitIndex: number) {
    setCrossed((prev) => {
      const next = prev.map((row) => row.map((cell) => [...cell]));
      next[r][c][digitIndex] = !next[r][c][digitIndex];
      return next;
    });
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
            {COL_LABELS.map((colLabel, c) => (
              <div key={`${rowLabel}${colLabel}`} className="deduction-cell">
                {Array.from({ length: 9 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`deduction-digit ${crossed[r][c][i] ? "out" : ""}`}
                    onClick={() => toggle(r, c, i)}
                    aria-label={`Toggle ${i + 1} in ${rowLabel}${colLabel}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: "0.75rem" }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setCrossed(defaultMarks())}
        >
          Reset notes
        </button>
      </div>
    </div>
  );
}
