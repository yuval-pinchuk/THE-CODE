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
  wantsRestart: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  code: string;
  managerId: string;
  players: Player[];
  phase: Phase;
  roundId: string | null;
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

/** Players who can still take turns. */
function activeTurnPlayers(room: Room): Player[] {
  return room.players.filter((p) => !p.hasSolved && !p.wantsRestart);
}

function nextActiveAfter(room: Room, playerId: string): string | null {
  const active = activeTurnPlayers(room);
  if (active.length === 0) return null;
  const idx = room.players.findIndex((p) => p.id === playerId);
  for (let step = 1; step <= room.players.length; step++) {
    const candidate = room.players[(idx + step) % room.players.length];
    if (!candidate.hasSolved && !candidate.wantsRestart) return candidate.id;
  }
  return active[0]?.id ?? null;
}

function firstActive(room: Room, preferNonManager = true): string | null {
  if (preferNonManager) {
    const nonManager = room.players.find(
      (p) => p.id !== room.managerId && !p.hasSolved && !p.wantsRestart,
    );
    if (nonManager) return nonManager.id;
  }
  return activeTurnPlayers(room)[0]?.id ?? null;
}

function resetRoundState(room: Room): void {
  room.roundId = randomUUID();
  room.assignments = createDerangement(room.players.map((p) => p.id));
  room.history = [];
  room.celebration = null;
  room.turnPlayerId = null;
  for (const p of room.players) {
    p.secretGrid = null;
    p.hasSolved = false;
    p.wantsRestart = false;
  }
}

function returnToLobby(room: Room): void {
  room.phase = "lobby";
  room.roundId = null;
  room.turnPlayerId = null;
  room.history = [];
  room.celebration = null;
  room.assignments = new Map();
  for (const p of room.players) {
    p.secretGrid = null;
    p.hasSolved = false;
    p.wantsRestart = false;
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
  // Only pause if an active (non-waiting) player is disconnected.
  return room.players.some((p) => !p.wantsRestart && !p.connected);
}

function newPlayer(id: string, name: string, socketId: string): Player {
  return {
    id,
    name,
    socketId,
    connected: true,
    secretGrid: null,
    hasSolved: false,
    wantsRestart: false,
    disconnectTimer: null,
  };
}

function repairAssignmentsAfterLeave(room: Room, leftId: string): void {
  room.assignments.delete(leftId);
  const remainingIds = room.players.map((p) => p.id);
  if (remainingIds.length < 2) {
    room.assignments = new Map();
    return;
  }

  for (const [fromId, toId] of [...room.assignments.entries()]) {
    if (toId !== leftId) continue;
    const options = remainingIds.filter((id) => id !== fromId);
    if (options.length === 0) {
      room.assignments.delete(fromId);
      continue;
    }
    // Prefer someone who isn't already targeted if possible.
    const targeted = new Set(room.assignments.values());
    const free = options.filter((id) => !targeted.has(id) || id === leftId);
    const pick = (free.length > 0 ? free : options)[randomInt(free.length > 0 ? free.length : options.length)];
    room.assignments.set(fromId, pick);
  }
}

function maybeStartNextRound(room: Room): boolean {
  const connected = room.players.filter((p) => p.connected);
  if (connected.length < MIN_PLAYERS) return false;
  if (!connected.every((p) => p.wantsRestart)) return false;

  room.phase = "setup";
  resetRoundState(room);
  return true;
}

function afterPlayerRemoved(room: Room, removedId: string, hadTurn: boolean): void {
  promoteManager(room);

  if (room.players.length < MIN_PLAYERS) {
    if (room.phase !== "lobby") returnToLobby(room);
    return;
  }

  if (room.phase === "lobby") return;

  repairAssignmentsAfterLeave(room, removedId);

  if (hadTurn || !room.turnPlayerId || !room.players.some((p) => p.id === room.turnPlayerId)) {
    room.turnPlayerId = firstActive(room, false);
  }

  maybeStartNextRound(room);
}

export function toPublicState(room: Room, viewerId: string): PublicRoomState {
  const viewer = room.players.find((p) => p.id === viewerId);
  const target = getTarget(room, viewerId);
  const unsolvedInGame = room.players.filter(
    (p) => !p.wantsRestart && !p.hasSolved,
  ).length;

  let message: string | null = null;
  if (isPaused(room)) {
    message = "Waiting for a player to reconnect…";
  } else if (viewer?.wantsRestart && room.phase === "playing") {
    message = "Waiting for others to restart…";
  } else if (viewer?.hasSolved && room.phase === "playing") {
    message = "You cracked your target’s code — spectating…";
  }

  return {
    code: room.code,
    phase: room.phase,
    roundId: room.roundId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      hasCode: p.secretGrid !== null,
      hasSolved: p.hasSolved,
      wantsRestart: p.wantsRestart,
      isManager: p.id === room.managerId,
    })),
    turnPlayerId: room.turnPlayerId,
    history: room.history,
    assignments: assignmentEdges(room),
    yourTargetId: target?.id ?? null,
    yourTargetName: target?.name ?? null,
    yourSeat: viewer?.wantsRestart ? "waitingRestart" : "playing",
    celebration: room.celebration,
    unsolvedCount: unsolvedInGame,
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
      roundId: null,
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
    room.turnPlayerId = firstActive(room);
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
  if (isPaused(room)) return { ok: false, error: "Waiting for a player to reconnect." };
  if (room.turnPlayerId !== playerId) return { ok: false, error: "Not your turn." };
  const self = room.players.find((p) => p.id === playerId);
  if (!self) return { ok: false, error: "Player not in room." };
  if (self.hasSolved) return { ok: false, error: "You already solved your target." };
  if (self.wantsRestart) return { ok: false, error: "You are waiting to restart." };
  if (axis !== "row" && axis !== "col") return { ok: false, error: "Invalid axis." };
  if (index !== 0 && index !== 1 && index !== 2) {
    return { ok: false, error: "Invalid row/column." };
  }
  if (!isValidLineValues(values)) {
    return { ok: false, error: "Guess must be 3 different digits from 1–9." };
  }

  const target = getTarget(room, playerId);
  if (!target?.secretGrid) {
    return { ok: false, error: "Target code missing." };
  }

  const truth = getLine(target.secretGrid, axis, index);
  const { gold, silver } = scoreLine(values, truth);

  room.history.push({
    kind: "guess",
    id: randomUUID(),
    playerId,
    playerName: self.name,
    axis,
    index,
    label: lineLabel(axis, index),
    values: [...values] as LineValues,
    gold,
    silver,
  });

  room.turnPlayerId = nextActiveAfter(room, playerId);

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
  if (isPaused(room)) return { ok: false, error: "Waiting for a player to reconnect." };
  if (room.turnPlayerId !== playerId) return { ok: false, error: "Not your turn." };
  const self = room.players.find((p) => p.id === playerId);
  if (!self) return { ok: false, error: "Player not in room." };
  if (self.hasSolved) return { ok: false, error: "You already solved your target." };
  if (self.wantsRestart) return { ok: false, error: "You are waiting to restart." };
  if (!isValidCode(grid)) {
    return { ok: false, error: "Solve must use each number 1–9 exactly once." };
  }

  const target = getTarget(room, playerId);
  if (!target?.secretGrid) {
    return { ok: false, error: "Target code missing." };
  }

  const correct = gridsEqual(grid, target.secretGrid);

  room.history.push({
    kind: "solve",
    id: randomUUID(),
    playerId,
    playerName: self.name,
    targetId: target.id,
    targetName: target.name,
    correct,
  });

  if (correct) {
    self.hasSolved = true;
    room.celebration = {
      id: randomUUID(),
      solverId: self.id,
      solverName: self.name,
      targetId: target.id,
      targetName: target.name,
    };
    room.turnPlayerId = nextActiveAfter(room, playerId);
  } else {
    room.turnPlayerId = nextActiveAfter(room, playerId);
  }

  return { ok: true, room, states: broadcastStates(room) };
}

export function requestRestart(roomCode: string, playerId: string): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "Player not in room." };
  if (room.phase !== "playing" && room.phase !== "setup") {
    return { ok: false, error: "Cannot restart from lobby." };
  }

  player.wantsRestart = true;

  if (room.turnPlayerId === playerId) {
    room.turnPlayerId = nextActiveAfter(room, playerId);
  }

  maybeStartNextRound(room);

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

      const removedId = still.id;
      const hadTurn = current.turnPlayerId === removedId;
      current.players = current.players.filter((p) => p.id !== removedId);

      if (current.players.length === 0) {
        rooms.delete(current.code);
        onRoomDeleted(current.code);
        return;
      }

      afterPlayerRemoved(current, removedId, hadTurn);
      onRoomUpdate(current, broadcastStates(current));
    }, RECONNECT_GRACE_MS);

    promoteManager(room);
    if (room.turnPlayerId === player.id && room.phase === "playing") {
      // Keep turn until grace ends; pause handles waiting.
    }
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

  const hadTurn = room.turnPlayerId === playerId;
  room.players = room.players.filter((p) => p.id !== playerId);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return { ok: true, room, states: new Map(), deleteRoom: true };
  }

  afterPlayerRemoved(room, playerId, hadTurn);

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
