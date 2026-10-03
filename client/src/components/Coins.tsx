type Props = {
  gold: number;
  silver: number;
};

export default function Coins({ gold, silver }: Props) {
  return (
    <span aria-label={`${gold} gold, ${silver} silver`}>
      {Array.from({ length: gold }, (_, i) => (
        <span key={`g${i}`} className="coin gold" />
      ))}
      {Array.from({ length: silver }, (_, i) => (
        <span key={`s${i}`} className="coin silver" />
      ))}
      {gold === 0 && silver === 0 ? <span style={{ color: "var(--muted)" }}>miss</span> : null}
    </span>
  );
}
