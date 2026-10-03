type Props = {
  used: Set<number>;
  onPick: (digit: number) => void;
  disabled?: boolean;
};

export default function DigitTray({ used, onPick, disabled }: Props) {
  return (
    <div className="digit-tray">
      {Array.from({ length: 9 }, (_, i) => i + 1).map((d) => (
        <button
          key={d}
          type="button"
          className="digit-chip"
          disabled={disabled || used.has(d)}
          onClick={() => onPick(d)}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
