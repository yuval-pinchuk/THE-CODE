import { FormEvent, useMemo, useState } from "react";
import type { Difficulty, PublicRoomState } from "@shared/types";
import { roomInviteUrl } from "../roomUrl";
import TurnTimeControl, { turnTimeLabel } from "../components/TurnTimeControl";
import VsSetup from "./VsSetup";

const MAX_PLAYERS = 8;

type Props = {
  state: PublicRoomState | null;
  playerId: string | null;
  busy: boolean;
  error: string | null;
  initialRoomCode: string | null;
  onJoin: (name: string, roomCode: string) => void;
  onStart: () => void;
  onLeave: () => void;
  onGoHome: () => void;
  onVsComputer: (name: string, difficulty: Difficulty, turnSeconds: number) => void;
  onStartVsRound: (difficulty: Difficulty, turnSeconds: number) => void;
  onSetTurnLimit: (turnSeconds: number) => void;
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
  onGoHome,
  onVsComputer,
  onStartVsRound,
  onSetTurnLimit,
}: Props) {
  const [name, setName] = useState(() => localStorage.getItem("ofiny_name") ?? "");
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? "");
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [vsOpen, setVsOpen] = useState(false);
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
          title: "PIN CODE",
          text: `Join my PIN CODE room ${state.code}`,
          url: inviteUrl,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    await copyInvite();
  }

  if (!state && vsOpen && !fromInviteLink) {
    return (
      <VsSetup
        initialName={name}
        initialDifficulty="medium"
        initialTurnSeconds={0}
        busy={busy}
        error={error}
        startLabel="Start"
        onStart={(nextName, difficulty, turnSeconds) => {
          setName(nextName);
          onVsComputer(nextName, difficulty, turnSeconds);
        }}
        onBack={() => setVsOpen(false)}
      />
    );
  }

  if (state?.vsComputer && state.phase === "lobby") {
    return (
      <VsSetup
        initialName={meName(state, playerId)}
        initialDifficulty={state.difficulty ?? "medium"}
        initialTurnSeconds={state.turnLimitSeconds}
        lockName
        busy={busy}
        error={error}
        startLabel="Start"
        onStart={(_name, difficulty, turnSeconds) => onStartVsRound(difficulty, turnSeconds)}
        onBack={onLeave}
        backLabel="Leave"
      />
    );
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
        {!fromInviteLink ? (
          <>
            <div style={{ height: "0.65rem" }} />
            <button
              type="button"
              className="btn btn-coral"
              disabled={busy}
              onClick={() => setVsOpen(true)}
            >
              VS Computer
            </button>
          </>
        ) : null}
        {fromInviteLink ? (
          <>
            <div style={{ height: "0.65rem" }} />
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button type="button" className="btn btn-ghost" onClick={onGoHome}>
                Go to home
              </button>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  const me = state.players.find((p) => p.id === playerId);
  const connectedCount = state.players.filter((p) => p.connected).length;
  const canStart =
    me?.isManager &&
    connectedCount >= 2 &&
    state.phase === "lobby";
  const canShare = typeof navigator.share === "function";
  const roomFull = state.players.length >= MAX_PLAYERS;

  return (
    <div className="panel">
      <h2>Room {state.code}</h2>
      {error ? <div className="error">{error}</div> : null}
      <p style={{ marginTop: 0, color: "var(--muted)", fontWeight: 700 }}>
        {connectedCount}/{MAX_PLAYERS} players · Manager starts with 2 or more.
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

      {connectedCount < 2 ? (
        <div className="share-card">
          <div className="banner warn">Share this room so friends can join</div>
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
        <div className="banner">
          {roomFull
            ? "Room full — manager can start"
            : `${connectedCount} players ready — manager can start (or invite more)`}
        </div>
      )}

      {connectedCount >= 2 && !roomFull ? (
        <div className="share-card" style={{ marginTop: "0.65rem" }}>
          <div className="btn-row share-actions">
            <button type="button" className="btn btn-primary btn-half" onClick={copyInvite}>
              Copy link
            </button>
            <button type="button" className="btn btn-coral btn-half" onClick={shareInvite}>
              {canShare ? "Share" : "Copy & share"}
            </button>
          </div>
          {shareStatus ? <p className="share-status">{shareStatus}</p> : null}
        </div>
      ) : null}

      <div style={{ height: "0.85rem" }} />
      {me?.isManager ? (
        <TurnTimeControl
          seconds={state.turnLimitSeconds}
          onChange={onSetTurnLimit}
        />
      ) : (
        <p className="turn-time-readout">
          Turn time: {turnTimeLabel(state.turnLimitSeconds)}
        </p>
      )}
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

function meName(state: PublicRoomState, playerId: string | null): string {
  return (
    state.players.find((p) => p.id === playerId)?.name ??
    localStorage.getItem("ofiny_name") ??
    ""
  );
}
