import { Fragment } from "react";
import { COL_LABELS, ROW_LABELS } from "@shared/types";

type Props = {
  values: (number | null)[][];
  onCellClick?: (row: number, col: number) => void;
  selected?: { row: number; col: number } | null;
  readOnly?: boolean;
};

export default function LabeledGrid({
  values,
  onCellClick,
  selected,
  readOnly,
}: Props) {
  return (
    <div className="grid-wrap" aria-label="3 by 3 code grid">
      <div className="grid-corner" />
      {COL_LABELS.map((label) => (
        <div key={label} className="grid-col-label">
          {label}
        </div>
      ))}
      {ROW_LABELS.map((rowLabel, r) => (
        <Fragment key={rowLabel}>
          <div className="grid-row-label">{rowLabel}</div>
          {COL_LABELS.map((colLabel, c) => {
            const value = values[r][c];
            const isSelected = selected?.row === r && selected?.col === c;
            return (
              <button
                key={`${rowLabel}${colLabel}`}
                type="button"
                className={`cell ${value ? "filled" : ""} ${isSelected ? "active" : ""} ${
                  !readOnly ? "selectable" : ""
                }`}
                onClick={() => onCellClick?.(r, c)}
                disabled={readOnly}
              >
                {value ?? ""}
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
