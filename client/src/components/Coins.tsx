type Props = {
  gold: number;
  silver: number;
  goldMarks?: (number | null)[];
  silverMarks?: (number | null)[];
};

export default function Coins({ gold, silver, goldMarks, silverMarks }: Props) {
  return (
    <span aria-label={`${gold} gold, ${silver} silver`} className="coins">
      {Array.from({ length: gold }, (_, i) => {
        const mark = goldMarks?.[i] ?? null;
        return (
          <span
            key={`g${i}`}
            className={`coin gold ${mark !== null ? "marked" : ""}`}
          >
            {mark !== null ? mark : null}
          </span>
        );
      })}
      {Array.from({ length: silver }, (_, i) => {
        const mark = silverMarks?.[i] ?? null;
        return (
          <span
            key={`s${i}`}
            className={`coin silver ${mark !== null ? "marked" : ""}`}
          >
            {mark !== null ? mark : null}
          </span>
        );
      })}
      {gold === 0 && silver === 0 ? <span style={{ color: "var(--muted)" }}>miss</span> : null}
    </span>
  );
}
