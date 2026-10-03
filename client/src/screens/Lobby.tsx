import { FormEvent, useState } from "react";
import type { PublicRoomState } from "@shared/types";

type Props = {
  state: PublicRoomState | null;
  playerId: string | null;
  busy: boolean;
  error: string | null;
  onJoin: (name: string, roomCode: string) => void;
  onStart: () => void;
  onLeave: () => void;
};

export default function Lobby({
  state,
  playerId,
  busy,
  error,
  onJoin,
  onStart,
  onLeave,
}: Props) {
  const [name, setName] = useState(() => localStorage.getItem("ofiny_name") ?? "");
  const [roomCode, setRoomCode] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    localStorage.setItem("ofiny_name", name.trim());
    onJoin(name.trim(), roomCode.trim());
  }

  if (!state) {
    return (
      <div className="panel">
        <h2>Enter a room</h2>
        {error ? <div className="error">{error}</div> : null}
        <form onSubmit={handleSubmit}>
          <label className="label" htmlFor="name">
            Display name
          </label>
          <input
            id="name"
            className="field"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="nickname"
            required
          />
          <label className="label" htmlFor="code">
            Room code
          </label>
          <input
            id="code"
            className="field field-code"
            value={roomCode}
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="1234"
            required
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Join room
          </button>
        </form>
      </div>
    );
  }

  const me = state.players.find((p) => p.id === playerId);
  const canStart =
    me?.isManager &&
    state.players.filter((p) => p.connected).length === 2 &&
    state.phase === "lobby";

  return (
    <div className="panel">
      <h2>Room {state.code}</h2>
      {error ? <div className="error">{error}</div> : null}
      <p style={{ marginTop: 0, color: "var(--muted)", fontWeight: 700 }}>
        Waiting for players. Manager starts when both are here.
      </p>
      <ul className="player-list">
        {state.players.map((p) => (
          <li key={p.id}>
            <span>
              {p.name}
              {!p.connected ? " (away)" : ""}
            </span>
            {p.isManager ? <span className="badge">Manager</span> : null}
          </li>
        ))}
      </ul>
      {state.players.length < 2 ? (
        <div className="banner warn">Share code {state.code} with a friend</div>
      ) : (
        <div className="banner">Both players ready — manager can start</div>
      )}
      <div style={{ height: "0.85rem" }} />
      {me?.isManager ? (
        <button
          type="button"
          className="btn btn-coral"
          disabled={!canStart || busy}
          onClick={onStart}
        >
          Start game
        </button>
      ) : (
        <div className="banner warn">Waiting for the manager to start…</div>
      )}
      <div style={{ height: "0.65rem" }} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button type="button" className="btn btn-ghost" onClick={onLeave} disabled={busy}>
          Leave room
        </button>
      </div>
    </div>
  );
}
