import type { PublicRoomState } from "@shared/types";

type Props = {
  state: PublicRoomState;
  busy: boolean;
  onLeave: () => void;
};

export default function WaitingRoom({ state, busy, onLeave }: Props) {
  const waiting = state.players.filter((p) => p.wantsRestart);
  const stillPlaying = state.players.filter((p) => !p.wantsRestart);

  return (
    <div className="panel">
      <h2>Waiting to restart</h2>
      <p className="lobby-lead">
        When everyone restarts or leaves, you’ll return to the lobby. There you can
        share the link and the manager starts the next game.
      </p>

      <h3 className="waiting-section-title">Ready to restart</h3>
      <ul className="player-list">
        {waiting.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <span className="badge">Waiting</span>
          </li>
        ))}
      </ul>

      {stillPlaying.length > 0 ? (
        <>
          <h3 className="waiting-section-title">Still playing</h3>
          <ul className="player-list">
            {stillPlaying.map((p) => (
              <li key={p.id}>
                <span>
                  {p.name}
                  {p.hasSolved ? " (spectating)" : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="banner warn">Game continues for the players above.</div>
        </>
      ) : (
        <div className="banner">Everyone is ready — returning to lobby…</div>
      )}

      <div style={{ height: "0.85rem" }} />
      <button type="button" className="btn btn-ghost" onClick={onLeave} disabled={busy}>
        Leave room
      </button>
    </div>
  );
}
