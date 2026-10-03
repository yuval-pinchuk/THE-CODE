import { useEffect, useRef, useState } from "react";
import type { Axis, Grid, LineValues, PublicRoomState } from "@shared/types";
import Game from "./screens/Game";
import Lobby from "./screens/Lobby";
import Setup from "./screens/Setup";
import { clearRoomNotes } from "./notesStorage";
import { readRoomFromUrl, setRoomInUrl } from "./roomUrl";
import {
  continueAfterSolve,
  guessLine,
  joinRoom,
  leaveRoom,
  onConnect,
  onRoomState,
  restartGame,
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
  const [linkRoomCode, setLinkRoomCode] = useState(() => readRoomFromUrl());
  const rejoinInFlight = useRef(false);
  const leavingRef = useRef(false);
  const prevPhaseRef = useRef<string | null>(null);
  const prevRoundIdRef = useRef<string | null>(null);

  useEffect(() => onRoomState(setState), []);

  // Clear local deduction boards when a round ends/restarts or the room returns to lobby.
  useEffect(() => {
    if (!state) {
      prevPhaseRef.current = null;
      prevRoundIdRef.current = null;
      return;
    }

    const prevPhase = prevPhaseRef.current;
    const prevRound = prevRoundIdRef.current;

    if (state.phase === "lobby" && prevPhase && prevPhase !== "lobby") {
      clearRoomNotes(state.code);
    }

    if (
      state.roundId &&
      prevRound &&
      prevRound !== state.roundId
    ) {
      clearRoomNotes(state.code);
    }

    prevPhaseRef.current = state.phase;
    prevRoundIdRef.current = state.roundId;
  }, [state]);

  useEffect(() => {
    async function rejoinFromStorage() {
      if (leavingRef.current || rejoinInFlight.current) return;

      const urlRoom = readRoomFromUrl();
      const savedRoom = localStorage.getItem(ROOM_KEY);
      const savedName = localStorage.getItem(NAME_KEY);
      const savedPlayer = localStorage.getItem(PLAYER_KEY);

      // Prefer URL room for a fresh invite join; only auto-reconnect when it matches.
      if (urlRoom && savedRoom && urlRoom !== savedRoom) return;
      if (!savedRoom || !savedName || !savedPlayer) return;

      rejoinInFlight.current = true;
      try {
        const res = await joinRoom({
          name: savedName,
          roomCode: savedRoom,
          playerId: savedPlayer,
        });
        if (leavingRef.current) return;
        if (!res.ok) {
          localStorage.removeItem(ROOM_KEY);
          return;
        }
        if (res.playerId) {
          localStorage.setItem(PLAYER_KEY, res.playerId);
          setPlayerId(res.playerId);
        }
        setRoomInUrl(savedRoom);
        if (res.state) setState(res.state);
      } finally {
        rejoinInFlight.current = false;
      }
    }

    void rejoinFromStorage();
    return onConnect(() => {
      void rejoinFromStorage();
    });
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
    setRoomInUrl(roomCode);
    setLinkRoomCode(roomCode);
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

  async function handleContinue() {
    setBusy(true);
    setError(null);
    const res = await continueAfterSolve();
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  async function handleRestart() {
    setBusy(true);
    setError(null);
    const roomCode = state?.code;
    const res = await restartGame();
    if (res.ok && roomCode) clearRoomNotes(roomCode);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  async function handleLeave() {
    leavingRef.current = true;
    setBusy(true);
    setError(null);
    const roomCode = state?.code ?? localStorage.getItem(ROOM_KEY);
    await leaveRoom();
    if (roomCode) clearRoomNotes(roomCode);
    localStorage.removeItem(ROOM_KEY);
    setRoomInUrl(null);
    setLinkRoomCode(null);
    setBusy(false);
    setState(null);
    leavingRef.current = false;
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
          initialRoomCode={linkRoomCode}
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

      {state && phase === "playing" && playerId ? (
        <Game
          state={state}
          playerId={playerId}
          busy={busy}
          error={error}
          onGuess={handleGuess}
          onSolve={handleSolve}
          onContinue={handleContinue}
          onRestart={handleRestart}
          onLeave={handleLeave}
        />
      ) : null}
    </div>
  );
}
