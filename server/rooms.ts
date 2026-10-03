import { randomInt, randomUUID } from "node:crypto";
import type {
  AssignmentEdge,
  Axis,
  CelebrationState,
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
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

interface Player {
  id: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  secretGrid: Grid | null;
  hasSolved: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  code: string;
  managerId: string;
  players: Player[];
  phase: Phase;
  turnPlayerId: string | null;
  history: HistoryEntry[];
  assignments: Map<string, string>;
  celebration: CelebrationState | null;
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

/** Single random cycle derangement: each player targets the next in a shuffled ring. */
function createDerangement(playerIds: string[]): Map<string, string> {
  if (playerIds.length < 2) return new Map();
  const ids = [...playerIds];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const map = new Map<string, string>();
  for (let i = 0; i < ids.length; i++) {
    map.set(ids[i], ids[(i + 1) % ids.length]);
  }
  return map;
}

function assignmentEdges(room: Room): AssignmentEdge[] {
  return [...room.assignments.entries()].map(([fromId, toId]) => ({ fromId, toId }));
}

function getTarget(room: Room, playerId: string): Player | undefined {
  const targetId = room.assignments.get(playerId);
  if (!targetId) return undefined;
  return room.players.find((p) => p.id === targetId);
}

function unsolvedPlayers(room: Room): Player[] {
  return room.players.filter((p) => !p.hasSolved);
}

function nextUnsolvedAfter(room: Room, playerId: string): string | null {
  const active = unsolvedPlayers(room);
  if (active.length === 0) return null;
  const idx = room.players.findIndex((p) => p.id === playerId);
  for (let step = 1; step <= room.players.length; step++) {
    const candidate = room.players[(idx + step) % room.players.length];
    if (!candidate.hasSolved) return candidate.id;
  }
  return active[0]?.id ?? null;
}

function firstUnsolved(room: Room, preferNonManager = true): string | null {
  if (preferNonManager) {
    const nonManager = room.players.find(
      (p) => p.id !== room.managerId && !p.hasSolved,
    );
    if (nonManager) return nonManager.id;
  }
  return unsolvedPlayers(room)[0]?.id ?? null;
}

function resetRoundState(room: Room): void {
  room.assignments = createDerangement(room.players.map((p) => p.id));
  room.history = [];
  room.celebration = null;
  room.turnPlayerId = null;
  for (const p of room.players) {
    p.secretGrid = null;
    p.hasSolved = false;
  }
}

function returnToLobby(room: Room): void {
  room.phase = "lobby";
  room.turnPlayerId = null;
  room.history = [];
  room.celebration = null;
  room.assignments = new Map();
  for (const p of room.players) {
    p.secretGrid = null;
    p.hasSolved = false;
  }
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

function newPlayer(
  id: string,
  name: string,
  socketId: string,
): Player {
  return {
    id,
    name,
    socketId,
    connected: true,
    secretGrid: null,
    hasSolved: false,
    disconnectTimer: null,
  };
}

export function toPublicState(room: Room, viewerId: string): PublicRoomState {
  const viewer = room.players.find((p) => p.id === viewerId);
  const target = getTarget(room, viewerId);
  const unsolvedCount = unsolvedPlayers(room).length;

  let message: string | null = null;
  if (isPaused(room)) {
    message = "Waiting for a player to reconnect…";
  } else if (viewer?.hasSolved && room.phase === "playing") {
    message = "You cracked your target’s code — waiting for others…";
  }

  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      hasCode: p.secretGrid !== null,
      hasSolved: p.hasSolved,
      isManager: p.id === room.managerId,
    })),
    turnPlayerId: room.turnPlayerId,
    history: room.history,
    assignments: assignmentEdges(room),
    yourTargetId: target?.id ?? null,
    yourTargetName: target?.name ?? null,
    celebration: room.celebration,
    unsolvedCount,
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
    const player = newPlayer(playerId, name, socketId);
    room = {
      code: roomCode,
      managerId: playerId,
      players: [player],
      phase: "lobby",
      turnPlayerId: null,
      history: [],
      assignments: new Map(),
      celebration: null,
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
    return { ok: false, error: "Room is full (max 8 players)." };
  }

  if (isNameTaken(room, name)) {
    return { ok: false, error: "That name is already taken in this room." };
  }

  const playerId = randomUUID();
  room.players.push(newPlayer(playerId, name, socketId));

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
  const connected = room.players.filter((p) => p.connected).length;
  if (connected < MIN_PLAYERS) {
    return { ok: false, error: `Need at least ${MIN_PLAYERS} players to start.` };
  }

  room.phase = "setup";
  resetRoundState(room);

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
  if (isPaused(room)) return { ok: false, error: "Waiting for a player to reconnect." };
  if (!isValidCode(grid)) {
    return { ok: false, error: "Code must use each number 1–9 exactly once." };
  }

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "Player not in room." };
  if (player.secretGrid) return { ok: false, error: "Code already locked in." };

  player.secretGrid = cloneGrid(grid);

  const allReady = room.players.every((p) => p.secretGrid !== null);
  if (allReady) {
    room.phase = "playing";
    room.turnPlayerId = firstUnsolved(room);
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
  if (room.celebration) return { ok: false, error: "Dismiss the celebration first." };
  if (isPaused(room)) return { ok: false, error: "Waiting for a player to reconnect." };
  if (room.turnPlayerId !== playerId) return { ok: false, error: "Not your turn." };
  const self = room.players.find((p) => p.id === playerId);
  if (self?.hasSolved) return { ok: false, error: "You already solved your target." };
  if (axis !== "row" && axis !== "col") return { ok: false, error: "Invalid axis." };
  if (index !== 0 && index !== 1 && index !== 2) {
    return { ok: false, error: "Invalid row/column." };
  }
  if (!isValidLineValues(values)) {
    return { ok: false, error: "Guess must be 3 different digits from 1–9." };
  }

  const player = room.players.find((p) => p.id === playerId);
  const target = getTarget(room, playerId);
  if (!player || !target?.secretGrid) {
    return { ok: false, error: "Target code missing." };
  }

  const truth = getLine(target.secretGrid, axis, index);
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

  room.turnPlayerId = nextUnsolvedAfter(room, playerId);

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
  if (room.celebration) return { ok: false, error: "Dismiss the celebration first." };
  if (isPaused(room)) return { ok: false, error: "Waiting for a player to reconnect." };
  if (room.turnPlayerId !== playerId) return { ok: false, error: "Not your turn." };
  const self = room.players.find((p) => p.id === playerId);
  if (self?.hasSolved) return { ok: false, error: "You already solved your target." };
  if (!isValidCode(grid)) {
    return { ok: false, error: "Solve must use each number 1–9 exactly once." };
  }

  const player = room.players.find((p) => p.id === playerId);
  const target = getTarget(room, playerId);
  if (!player || !target?.secretGrid) {
    return { ok: false, error: "Target code missing." };
  }

  const correct = gridsEqual(grid, target.secretGrid);

  room.history.push({
    kind: "solve",
    id: randomUUID(),
    playerId,
    playerName: player.name,
    targetId: target.id,
    targetName: target.name,
    correct,
  });

  if (correct) {
    player.hasSolved = true;
    room.celebration = {
      solverId: player.id,
      solverName: player.name,
      targetId: target.id,
      targetName: target.name,
    };
    room.turnPlayerId = nextUnsolvedAfter(room, playerId);
  } else {
    room.turnPlayerId = nextUnsolvedAfter(room, playerId);
  }

  return { ok: true, room, states: broadcastStates(room) };
}

export function continueAfterSolve(roomCode: string, playerId: string): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  if (!room.players.some((p) => p.id === playerId)) {
    return { ok: false, error: "Player not in room." };
  }
  if (!room.celebration) return { ok: false, error: "Nothing to continue." };
  if (unsolvedPlayers(room).length <= 1) {
    return { ok: false, error: "Game is over — leave or restart." };
  }

  room.celebration = null;
  if (!room.turnPlayerId || room.players.find((p) => p.id === room.turnPlayerId)?.hasSolved) {
    room.turnPlayerId = firstUnsolved(room, false);
  }

  return { ok: true, room, states: broadcastStates(room) };
}

export function restartGame(roomCode: string, playerId: string): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  if (!room.players.some((p) => p.id === playerId)) {
    return { ok: false, error: "Player not in room." };
  }
  if (room.phase !== "playing" && room.phase !== "setup" && room.phase !== "finished") {
    return { ok: false, error: "Cannot restart from lobby." };
  }
  if (room.players.filter((p) => p.connected).length < MIN_PLAYERS) {
    return { ok: false, error: `Need at least ${MIN_PLAYERS} players to restart.` };
  }

  room.phase = "setup";
  resetRoundState(room);

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

      if (current.phase !== "lobby") {
        returnToLobby(current);
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

  if (room.phase !== "lobby") {
    returnToLobby(room);
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
