import { randomUUID } from "node:crypto";
import type {
  Axis,
  Grid,
  HistoryEntry,
  LineValues,
  Phase,
  PublicRoomState,
} from "../shared/types.js";
import { lineLabel } from "../shared/types.js";
import {
  cloneGrid,
  getLine,
  gridsEqual,
  isValidCode,
  isValidLineValues,
  scoreLine,
} from "./game.js";

const RECONNECT_GRACE_MS = 60_000;
const MAX_PLAYERS = 2;

interface Player {
  id: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  secretGrid: Grid | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  code: string;
  managerId: string;
  players: Player[];
  phase: Phase;
  turnPlayerId: string | null;
  history: HistoryEntry[];
  winnerId: string | null;
  createdAt: number;
}

const rooms = new Map<string, Room>();

function normalizeRoomCode(code: string): string | null {
  const trimmed = code.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;
  return trimmed;
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isNameTaken(room: Room, name: string, exceptPlayerId?: string): boolean {
  return room.players.some(
    (p) => p.id !== exceptPlayerId && namesMatch(p.name, name),
  );
}

function getOpponent(room: Room, playerId: string): Player | undefined {
  return room.players.find((p) => p.id !== playerId);
}

function promoteManager(room: Room): void {
  const connected = room.players.filter((p) => p.connected);
  if (connected.length === 0) return;
  if (!connected.some((p) => p.id === room.managerId)) {
    room.managerId = connected[0].id;
  }
}

function isPaused(room: Room): boolean {
  if (room.phase === "lobby") return false;
  return room.players.some((p) => !p.connected);
}

export function toPublicState(room: Room, viewerId: string): PublicRoomState {
  const viewer = room.players.find((p) => p.id === viewerId);
  const winner = room.winnerId
    ? room.players.find((p) => p.id === room.winnerId)
    : undefined;

  let message: string | null = null;
  if (isPaused(room) && room.phase !== "finished") {
    message = "Opponent disconnected — waiting for reconnect…";
  } else if (room.phase === "finished" && winner) {
    message =
      winner.id === viewerId
        ? "You cracked the code! You win!"
        : `${winner.name} cracked your code.`;
  }

  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      hasCode: p.secretGrid !== null,
      isManager: p.id === room.managerId,
    })),
    turnPlayerId: room.turnPlayerId,
    history: room.history,
    winnerId: room.winnerId,
    winnerName: winner?.name ?? null,
    yourGrid: viewer?.secretGrid ? cloneGrid(viewer.secretGrid) : null,
    paused: isPaused(room),
    message,
  };
}

export type JoinResult =
  | { ok: true; playerId: string; room: Room; state: PublicRoomState }
  | { ok: false; error: string };

export function joinRoom(
  roomCodeRaw: string,
  nameRaw: string,
  socketId: string,
  existingPlayerId?: string,
): JoinResult {
  const roomCode = normalizeRoomCode(roomCodeRaw);
  if (!roomCode) {
    return { ok: false, error: "Room code must be exactly 4 digits." };
  }

  const name = nameRaw.trim().slice(0, 20);
  if (name.length < 1) {
    return { ok: false, error: "Please enter a display name." };
  }

  let room = rooms.get(roomCode);

  if (existingPlayerId && room) {
    const existing = room.players.find((p) => p.id === existingPlayerId);
    if (existing) {
      if (isNameTaken(room, name, existing.id)) {
        return { ok: false, error: "That name is already taken in this room." };
      }
      if (existing.disconnectTimer) {
        clearTimeout(existing.disconnectTimer);
        existing.disconnectTimer = null;
      }
      existing.socketId = socketId;
      existing.connected = true;
      existing.name = name;
      promoteManager(room);
      return {
        ok: true,
        playerId: existing.id,
        room,
        state: toPublicState(room, existing.id),
      };
    }
  }

  if (!room) {
    const playerId = randomUUID();
    const player: Player = {
      id: playerId,
      name,
      socketId,
      connected: true,
      secretGrid: null,
      disconnectTimer: null,
    };
    room = {
      code: roomCode,
      managerId: playerId,
      players: [player],
      phase: "lobby",
      turnPlayerId: null,
      history: [],
      winnerId: null,
      createdAt: Date.now(),
    };
    rooms.set(roomCode, room);
    return {
      ok: true,
      playerId,
      room,
      state: toPublicState(room, playerId),
    };
  }

  if (room.phase !== "lobby") {
    return { ok: false, error: "Game already in progress." };
  }

  if (room.players.length >= MAX_PLAYERS) {
    return { ok: false, error: "Room is full." };
  }

  if (isNameTaken(room, name)) {
    return { ok: false, error: "That name is already taken in this room." };
  }

  const playerId = randomUUID();
  room.players.push({
    id: playerId,
    name,
    socketId,
    connected: true,
    secretGrid: null,
    disconnectTimer: null,
  });


  return {
    ok: true,
    playerId,
    room,
    state: toPublicState(room, playerId),
  };
}

export type ActionResult =
  | { ok: true; room: Room; states: Map<string, PublicRoomState>; deleteRoom?: boolean }
  | { ok: false; error: string };

function broadcastStates(room: Room): Map<string, PublicRoomState> {
  const map = new Map<string, PublicRoomState>();
  for (const p of room.players) {
    map.set(p.id, toPublicState(room, p.id));
  }
  return map;
}

export function startGame(roomCode: string, playerId: string): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  if (room.managerId !== playerId) return { ok: false, error: "Only the manager can start." };
  if (room.phase !== "lobby") return { ok: false, error: "Game already started." };
  if (room.players.filter((p) => p.connected).length < 2) {
    return { ok: false, error: "Need 2 players to start." };
  }

  room.phase = "setup";
  for (const p of room.players) {
    p.secretGrid = null;
  }
  room.history = [];
  room.winnerId = null;
  room.turnPlayerId = null;

  return { ok: true, room, states: broadcastStates(room) };
}

export function setCode(
  roomCode: string,
  playerId: string,
  grid: unknown,
): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  if (room.phase !== "setup") return { ok: false, error: "Not in setup phase." };
  if (isPaused(room)) return { ok: false, error: "Waiting for opponent to reconnect." };
  if (!isValidCode(grid)) {
    return { ok: false, error: "Code must use each number 1–9 exactly once." };
  }

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "Player not in room." };
  if (player.secretGrid) return { ok: false, error: "Code already locked in." };

  player.secretGrid = cloneGrid(grid);

  const bothReady = room.players.every((p) => p.secretGrid !== null);
  if (bothReady) {
    room.phase = "playing";
    // Non-manager goes first
    const first = room.players.find((p) => p.id !== room.managerId) ?? room.players[0];
    room.turnPlayerId = first.id;
  }

  return { ok: true, room, states: broadcastStates(room) };
}

export function guessLine(
  roomCode: string,
  playerId: string,
  axis: Axis,
  index: number,
  values: unknown,
): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  if (room.phase !== "playing") return { ok: false, error: "Game is not in progress." };
  if (isPaused(room)) return { ok: false, error: "Waiting for opponent to reconnect." };
  if (room.turnPlayerId !== playerId) return { ok: false, error: "Not your turn." };
  if (axis !== "row" && axis !== "col") return { ok: false, error: "Invalid axis." };
  if (index !== 0 && index !== 1 && index !== 2) {
    return { ok: false, error: "Invalid row/column." };
  }
  if (!isValidLineValues(values)) {
    return { ok: false, error: "Guess must be 3 different digits from 1–9." };
  }

  const player = room.players.find((p) => p.id === playerId);
  const opponent = getOpponent(room, playerId);
  if (!player || !opponent?.secretGrid) {
    return { ok: false, error: "Opponent code missing." };
  }

  const truth = getLine(opponent.secretGrid, axis, index);
  const { gold, silver } = scoreLine(values, truth);

  room.history.push({
    kind: "guess",
    id: randomUUID(),
    playerId,
    playerName: player.name,
    axis,
    index,
    label: lineLabel(axis, index),
    values: [...values] as LineValues,
    gold,
    silver,
  });

  room.turnPlayerId = opponent.id;

  return { ok: true, room, states: broadcastStates(room) };
}

export function solve(
  roomCode: string,
  playerId: string,
  grid: unknown,
): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  if (room.phase !== "playing") return { ok: false, error: "Game is not in progress." };
  if (isPaused(room)) return { ok: false, error: "Waiting for opponent to reconnect." };
  if (room.turnPlayerId !== playerId) return { ok: false, error: "Not your turn." };
  if (!isValidCode(grid)) {
    return { ok: false, error: "Solve must use each number 1–9 exactly once." };
  }

  const player = room.players.find((p) => p.id === playerId);
  const opponent = getOpponent(room, playerId);
  if (!player || !opponent?.secretGrid) {
    return { ok: false, error: "Opponent code missing." };
  }

  const correct = gridsEqual(grid, opponent.secretGrid);

  room.history.push({
    kind: "solve",
    id: randomUUID(),
    playerId,
    playerName: player.name,
    correct,
  });

  if (correct) {
    room.phase = "finished";
    room.winnerId = playerId;
    room.turnPlayerId = null;
  } else {
    room.turnPlayerId = opponent.id;
  }

  return { ok: true, room, states: broadcastStates(room) };
}

export function handleDisconnect(
  socketId: string,
  onRoomUpdate: (room: Room, states: Map<string, PublicRoomState>) => void,
  onRoomDeleted: (code: string) => void,
): void {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) continue;

    player.connected = false;
    player.socketId = null;

    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);

    player.disconnectTimer = setTimeout(() => {
      const current = rooms.get(room.code);
      if (!current) return;
      const still = current.players.find((p) => p.id === player.id);
      if (!still || still.connected) return;

      current.players = current.players.filter((p) => p.id !== player.id);

      if (current.players.length === 0) {
        rooms.delete(current.code);
        onRoomDeleted(current.code);
        return;
      }

      promoteManager(current);

      if (current.phase !== "lobby" && current.phase !== "finished") {
        // Mid-game permanent leave: end or return to lobby with one player
        current.phase = "lobby";
        current.turnPlayerId = null;
        current.history = [];
        current.winnerId = null;
        for (const p of current.players) {
          p.secretGrid = null;
        }
      }

      onRoomUpdate(current, broadcastStates(current));
    }, RECONNECT_GRACE_MS);

    promoteManager(room);
    onRoomUpdate(room, broadcastStates(room));
    return;
  }
}

export function leaveRoom(roomCode: string, playerId: string): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "Player not in room." };

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }

  room.players = room.players.filter((p) => p.id !== playerId);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return { ok: true, room, states: new Map(), deleteRoom: true };
  }

  promoteManager(room);

  if (room.phase !== "lobby" && room.phase !== "finished") {
    room.phase = "lobby";
    room.turnPlayerId = null;
    room.history = [];
    room.winnerId = null;
    for (const p of room.players) {
      p.secretGrid = null;
    }
  }

  return { ok: true, room, states: broadcastStates(room) };
}

export function getRoom(roomCode: string): Room | undefined {
  return rooms.get(roomCode);
}

export function getConnectedSocketIds(roomCode: string): { playerId: string; socketId: string }[] {
  const room = rooms.get(roomCode);
  if (!room) return [];
  return room.players
    .filter((p): p is Player & { socketId: string } => !!p.socketId)
    .map((p) => ({ playerId: p.id, socketId: p.socketId }));
}
