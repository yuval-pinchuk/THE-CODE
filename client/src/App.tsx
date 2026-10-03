import { useEffect, useState } from "react";
import type { Axis, Grid, LineValues, PublicRoomState } from "@shared/types";
import Game from "./screens/Game";
import Lobby from "./screens/Lobby";
import Setup from "./screens/Setup";
import {
  guessLine,
  joinRoom,
  leaveRoom,
  onRoomState,
  setCode,
  solveCode,
  startGame,
} from "./socket";

const PLAYER_KEY = "ofiny_player_id";
const ROOM_KEY = "ofiny_room_code";
const NAME_KEY = "ofiny_name";

export default function App() {
  const [state, setState] = useState<PublicRoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(
    () => localStorage.getItem(PLAYER_KEY),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onRoomState(setState), []);

  useEffect(() => {
    const savedRoom = localStorage.getItem(ROOM_KEY);
    const savedName = localStorage.getItem(NAME_KEY);
    const savedPlayer = localStorage.getItem(PLAYER_KEY);
    if (!savedRoom || !savedName || !savedPlayer) return;

    let cancelled = false;
    (async () => {
      setBusy(true);
      const res = await joinRoom({
        name: savedName,
        roomCode: savedRoom,
        playerId: savedPlayer,
      });
      if (cancelled) return;
      setBusy(false);
      if (!res.ok) {
        localStorage.removeItem(ROOM_KEY);
        return;
      }
      if (res.playerId) {
        localStorage.setItem(PLAYER_KEY, res.playerId);
        setPlayerId(res.playerId);
      }
      if (res.state) setState(res.state);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleJoin(name: string, roomCode: string) {
    setBusy(true);
    setError(null);
    const res = await joinRoom({
      name,
      roomCode,
      playerId: localStorage.getItem(PLAYER_KEY) ?? undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.playerId) {
      localStorage.setItem(PLAYER_KEY, res.playerId);
      setPlayerId(res.playerId);
    }
    localStorage.setItem(ROOM_KEY, roomCode);
    localStorage.setItem(NAME_KEY, name);
    if (res.state) setState(res.state);
  }

  async function handleStart() {
    setBusy(true);
    setError(null);
    const res = await startGame();
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  async function handleSetCode(grid: Grid) {
    setBusy(true);
    setError(null);
    const res = await setCode({ grid });
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  async function handleGuess(axis: Axis, index: number, values: LineValues) {
    setBusy(true);
    setError(null);
    const res = await guessLine({ axis, index, values });
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  async function handleSolve(grid: Grid) {
    setBusy(true);
    setError(null);
    const res = await solveCode({ grid });
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  async function handleLeave() {
    setBusy(true);
    setError(null);
    await leaveRoom();
    localStorage.removeItem(ROOM_KEY);
    setBusy(false);
    setState(null);
  }

  const phase = state?.phase;

  return (
    <div className="app-shell">
      <header>
        <h1 className="brand">
          THE <span>CODE</span>
        </h1>
        <p className="tagline">Crack the 3×3 code</p>
      </header>

      {!state || phase === "lobby" ? (
        <Lobby
          state={state}
          playerId={playerId}
          busy={busy}
          error={error}
          onJoin={handleJoin}
          onStart={handleStart}
          onLeave={handleLeave}
        />
      ) : null}

      {state && phase === "setup" && playerId ? (
        <Setup
          state={state}
          playerId={playerId}
          busy={busy}
          error={error}
          onSubmit={handleSetCode}
        />
      ) : null}

      {state && (phase === "playing" || phase === "finished") && playerId ? (
        <Game
          state={state}
          playerId={playerId}
          busy={busy}
          error={error}
          onGuess={handleGuess}
          onSolve={handleSolve}
          onLeave={handleLeave}
        />
      ) : null}
    </div>
  );
}
