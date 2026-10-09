type Props = {
  seconds: number;
  onChange: (seconds: number) => void;
  id?: string;
};

export function turnTimeLabel(seconds: number): string {
  return seconds === 0 ? "No Limit" : `${seconds}s`;
}

function clamp(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.max(0, Math.min(240, Math.round(seconds)));
}

export default function TurnTimeControl({ seconds, onChange, id = "turn-time" }: Props) {
  function setSeconds(next: number) {
    const clamped = clamp(next);
    if (clamped !== seconds) onChange(clamped);
  }

  return (
    <div>
      <label className="label" htmlFor={id}>
        Turn time
      </label>
      <div className="turn-time-row">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setSeconds(seconds - 1)}
          aria-label="Decrease turn time"
        >
          −
        </button>
        <div className="turn-time-value" id={id}>
          {turnTimeLabel(seconds)}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setSeconds(seconds + 1)}
          aria-label="Increase turn time"
        >
          +
        </button>
      </div>
      <input
        className="turn-time-slider"
        type="range"
        min={0}
        max={240}
        step={1}
        value={seconds}
        aria-label="Turn time in seconds"
        onChange={(e) => setSeconds(Number(e.target.value))}
      />
    </div>
  );
}
