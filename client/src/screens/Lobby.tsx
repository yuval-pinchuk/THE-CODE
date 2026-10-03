import { FormEvent, useMemo, useState } from "react";
import type { PublicRoomState } from "@shared/types";
import { roomInviteUrl } from "../roomUrl";

type Props = {
  state: PublicRoomState | null;
  playerId: string | null;
  busy: boolean;
  error: string | null;
  initialRoomCode: string | null;
  onJoin: (name: string, roomCode: string) => void;
  onStart: () => void;
  onLeave: () => void;
};

export default function Lobby({
  state,
  playerId,
  busy,
  error,
  initialRoomCode,
  onJoin,
  onStart,
  onLeave,
}: Props) {
  const [name, setName] = useState(() => localStorage.getItem("ofiny_name") ?? "");
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? "");
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const fromInviteLink = Boolean(initialRoomCode);

  const inviteUrl = useMemo(
    () => (state ? roomInviteUrl(state.code) : ""),
    [state],
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    localStorage.setItem("ofiny_name", name.trim());
    onJoin(name.trim(), roomCode.trim());
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setShareStatus("Link copied");
    } catch {
      setShareStatus("Couldn’t copy — select the link instead");
    }
    window.setTimeout(() => setShareStatus(null), 2000);
  }

  async function shareInvite() {
    if (!inviteUrl || !state) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "THE CODE",
          text: `Join my THE CODE room ${state.code}`,
          url: inviteUrl,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    await copyInvite();
  }

  if (!state) {
    return (
      <div className="panel">
        <h2>{fromInviteLink ? `Join room ${initialRoomCode}` : "Enter a room"}</h2>
        {fromInviteLink ? (
          <p className="lobby-lead">Enter your name to join this room.</p>
        ) : null}
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
            autoFocus
          />
          {fromInviteLink ? (
            <input type="hidden" name="room" value={roomCode} />
          ) : (
            <>
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
            </>
          )}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {fromInviteLink ? "Join room" : "Create / join room"}
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
  const canShare = typeof navigator.share === "function";

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
        <div className="share-card">
          <div className="banner warn">Share this room so a friend can join</div>
          <div className="btn-row share-actions">
            <button type="button" className="btn btn-primary btn-half" onClick={copyInvite}>
              Copy link
            </button>
            <button type="button" className="btn btn-coral btn-half" onClick={shareInvite}>
              {canShare ? "Share" : "Copy & share"}
            </button>
          </div>
          {shareStatus ? <p className="share-status">{shareStatus}</p> : null}
          <p className="share-code-hint">Or share code {state.code}</p>
        </div>
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
