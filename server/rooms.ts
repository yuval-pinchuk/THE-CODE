import { randomInt, randomUUID } from "node:crypto";
import type {
  AssignmentEdge,
  Axis,
  CelebrationState,
  Difficulty,
  Grid,
  HistoryEntry,
  LineValues,
  LockedBoard,
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
  randomCode,
  scoreLine,
} from "./game.js";

const RECONNECT_GRACE_MS = 15 * 60_000;
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

function emptyLockedBoard(): LockedBoard {
  return [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
}

function cloneLockedBoard(board: LockedBoard): LockedBoard {
  return board.map((row) => [...row]) as LockedBoard;
}

function isValidLockedBoard(value: unknown): value is LockedBoard {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const seen = new Set<number>();
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 3) return false;
    for (const cell of row) {
      if (cell === null) continue;
      if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 1 || cell > 9) {
        return false;
      }
      if (seen.has(cell)) return false;
      seen.add(cell);
    }
  }
  return true;
}

function lockedBoardsEqual(a: LockedBoard, b: LockedBoard): boolean {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

interface Player {
  id: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  secretGrid: Grid | null;
  hasSolved: boolean;
  wantsRestart: boolean;
  lockedBoard: LockedBoard;
  isBot: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface Room {
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
  vsComputer: boolean;
  difficulty: Difficulty | null;
  turnLimitSeconds: number;
  turnDeadline: number | null;
  turnClockKey: string | null;
  turnSerial: number;
  automationGen: number;
  turnTimer: ReturnType<typeof setTimeout> | null;
  botTimer: ReturnType<typeof setTimeout> | null;
  botTurnKey: string | null;
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

export function clearAutomationTimers(room: Room): void {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  if (room.botTimer) clearTimeout(room.botTimer);
  room.turnTimer = null;
  room.botTimer = null;
}

function resetRoundState(room: Room): void {
  room.roundId = randomUUID();
  room.assignments = createDerangement(room.players.map((p) => p.id));
  room.history = [];
  room.celebration = null;
  room.turnPlayerId = null;
  room.turnDeadline = null;
  room.turnClockKey = null;
  room.turnSerial = 0;
  room.botTurnKey = null;
  for (const p of room.players) {
    p.secretGrid = null;
    p.hasSolved = false;
    p.wantsRestart = false;
    p.lockedBoard = emptyLockedBoard();
  }
}

function returnToLobby(room: Room): void {
  clearAutomationTimers(room);
  room.phase = "lobby";
  room.roundId = null;
  room.turnPlayerId = null;
  room.history = [];
  room.celebration = null;
  room.assignments = new Map();
  room.turnDeadline = null;
  room.turnClockKey = null;
  room.turnSerial = 0;
  room.botTurnKey = null;
  for (const p of room.players) {
    p.secretGrid = null;
    p.hasSolved = false;
    p.wantsRestart = false;
    p.lockedBoard = emptyLockedBoard();
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
  // Only pause if an active (non-waiting) human is disconnected.
  return room.players.some((p) => !p.isBot && !p.wantsRestart && !p.connected);
}

export function isRoomPaused(room: Room): boolean {
  return isPaused(room);
}

export function syncTurnDeadline(room: Room): void {
  if (isPaused(room)) {
    room.turnDeadline = null;
    room.turnClockKey = null;
    return;
  }
  if (room.phase !== "playing" || !room.turnPlayerId || room.turnLimitSeconds <= 0) {
    room.turnDeadline = null;
    room.turnClockKey = null;
    return;
  }
  const key = `${room.roundId}:${room.turnPlayerId}:${room.turnSerial}`;
  if (room.turnClockKey === key && room.turnDeadline) return;
  room.turnClockKey = key;
  room.turnDeadline = Date.now() + room.turnLimitSeconds * 1000;
}

function bumpTurn(room: Room): void {
  room.turnSerial += 1;
  room.turnClockKey = null;
  room.botTurnKey = null;
  syncTurnDeadline(room);
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
    lockedBoard: emptyLockedBoard(),
    isBot: false,
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

/** When every connected player has opted to restart, return to lobby for manager Start. */
function maybeReturnToLobbyAfterRestartVotes(room: Room): boolean {
  const connected = room.players.filter((p) => p.connected);
  if (connected.length === 0) return false;
  if (!connected.every((p) => p.wantsRestart)) return false;
  returnToLobby(room);
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

  maybeReturnToLobbyAfterRestartVotes(room);
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
      isBot: p.isBot,
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
    playerLockedBoards: Object.fromEntries(
      room.players.map((p) => [p.id, cloneLockedBoard(p.lockedBoard)]),
    ),
    paused: isPaused(room),
    message,
    vsComputer: room.vsComputer,
    difficulty: room.difficulty,
    turnLimitSeconds: room.turnLimitSeconds,
    turnDeadline: room.phase === "playing" ? room.turnDeadline : null,
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

  if (room?.vsComputer && !(existingPlayerId && room.players.some((p) => p.id === existingPlayerId && !p.isBot))) {
    return { ok: false, error: "This room is private." };
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
      vsComputer: false,
      difficulty: null,
      turnLimitSeconds: 0,
      turnDeadline: null,
      turnClockKey: null,
      turnSerial: 0,
      automationGen: 0,
      turnTimer: null,
      botTimer: null,
      botTurnKey: null,
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

export function broadcastStates(room: Room): Map<string, PublicRoomState> {
  const map = new Map<string, PublicRoomState>();
  for (const p of room.players) {
    map.set(p.id, toPublicState(room, p.id));
  }
  return map;
}

function applyVsSettings(room: Room, difficulty: unknown, turnSeconds: unknown): string | null {
  if (!room.vsComputer) return null;
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    return "Choose easy, medium, or hard.";
  }
  const turnError = validateTurnSeconds(turnSeconds);
  if (turnError || typeof turnSeconds !== "number") return turnError ?? "Turn time must be between 0 and 240 seconds.";
  room.difficulty = difficulty;
  room.turnLimitSeconds = turnSeconds;
  return null;
}

function validateTurnSeconds(turnSeconds: unknown): string | null {
  if (
    typeof turnSeconds !== "number" ||
    !Number.isInteger(turnSeconds) ||
    turnSeconds < 0 ||
    turnSeconds > 240
  ) {
    return "Turn time must be between 0 and 240 seconds.";
  }
  return null;
}

export function setTurnLimit(
  roomCode: string,
  playerId: string,
  turnSeconds: unknown,
): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  if (room.managerId !== playerId) return { ok: false, error: "Only the manager can set the turn time." };
  if (room.phase !== "lobby") return { ok: false, error: "Turn time can only be changed in the lobby." };
  const turnError = validateTurnSeconds(turnSeconds);
  if (turnError || typeof turnSeconds !== "number") {
    return { ok: false, error: turnError ?? "Turn time must be between 0 and 240 seconds." };
  }
  if (room.turnLimitSeconds === turnSeconds) {
    return { ok: true, room, states: broadcastStates(room) };
  }
  room.turnLimitSeconds = turnSeconds;
  return { ok: true, room, states: broadcastStates(room) };
}

export function startVsComputer(
  nameRaw: string,
  difficulty: unknown,
  turnSeconds: unknown,
  socketId: string,
): JoinResult {
  const name = nameRaw.trim().slice(0, 20);
  if (name.length < 1) return { ok: false, error: "Please enter a display name." };
  if (namesMatch(name, "Computer")) {
    return { ok: false, error: "That name is reserved." };
  }

  let code = "";
  for (let attempt = 0; attempt < 30; attempt++) {
    code = String(randomInt(1000, 10000));
    if (!rooms.has(code)) break;
  }
  if (!code || rooms.has(code)) return { ok: false, error: "Couldn’t start a match. Try again." };

  const humanId = randomUUID();
  const botId = randomUUID();
  const human = newPlayer(humanId, name, socketId);
  const bot = newPlayer(botId, "Computer", "");
  bot.socketId = null;
  bot.isBot = true;
  bot.connected = true;

  const room: Room = {
    code,
    managerId: humanId,
    players: [human, bot],
    phase: "lobby",
    roundId: null,
    turnPlayerId: null,
    history: [],
    assignments: new Map(),
    celebration: null,
    createdAt: Date.now(),
    vsComputer: true,
    difficulty: null,
    turnLimitSeconds: 0,
    turnDeadline: null,
    turnClockKey: null,
    turnSerial: 0,
    automationGen: 0,
    turnTimer: null,
    botTimer: null,
    botTurnKey: null,
  };
  const settingsError = applyVsSettings(room, difficulty, turnSeconds);
  if (settingsError) return { ok: false, error: settingsError };

  rooms.set(code, room);
  room.phase = "setup";
  resetRoundState(room);
  bot.secretGrid = randomCode();

  return {
    ok: true,
    playerId: humanId,
    room,
    state: toPublicState(room, humanId),
  };
}

export function startGame(
  roomCode: string,
  playerId: string,
  difficulty?: unknown,
  turnSeconds?: unknown,
): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  if (room.managerId !== playerId) return { ok: false, error: "Only the manager can start." };
  if (room.phase !== "lobby") return { ok: false, error: "Game already started." };
  const connected = room.players.filter((p) => p.connected).length;
  if (connected < MIN_PLAYERS) {
    return { ok: false, error: `Need at least ${MIN_PLAYERS} players to start.` };
  }
  if (room.vsComputer) {
    const settingsError = applyVsSettings(room, difficulty ?? room.difficulty, turnSeconds ?? room.turnLimitSeconds);
    if (settingsError) return { ok: false, error: settingsError };
  }

  clearAutomationTimers(room);
  room.phase = "setup";
  resetRoundState(room);
  const bot = room.players.find((p) => p.isBot);
  if (bot) bot.secretGrid = randomCode();

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
    bumpTurn(room);
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
  bumpTurn(room);

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
  bumpTurn(room);

  return { ok: true, room, states: broadcastStates(room) };
}

export function skipExpiredTurn(roomCode: string): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  if (room.phase !== "playing" || !room.turnPlayerId) {
    return { ok: false, error: "No turn to skip." };
  }
  if (isPaused(room)) return { ok: false, error: "Game is paused." };
  if (!room.turnDeadline || Date.now() + 25 < room.turnDeadline) {
    return { ok: false, error: "Turn has not expired." };
  }

  const current = room.turnPlayerId;
  room.turnPlayerId = nextActiveAfter(room, current);
  bumpTurn(room);
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
  if (room.vsComputer) {
    for (const other of room.players) {
      if (other.isBot) other.wantsRestart = true;
    }
  }

  if (room.turnPlayerId === playerId) {
    room.turnPlayerId = nextActiveAfter(room, playerId);
  }

  maybeReturnToLobbyAfterRestartVotes(room);

  return { ok: true, room, states: broadcastStates(room) };
}

export function updateLockedBoard(
  roomCode: string,
  playerId: string,
  lockedRaw: unknown,
): ActionResult {
  const room = rooms.get(roomCode);
  if (!room) return { ok: false, error: "Room not found." };
  if (room.phase !== "playing" && room.phase !== "setup") {
    return { ok: false, error: "No active round." };
  }
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "Player not in room." };
  if (!isValidLockedBoard(lockedRaw)) {
    return { ok: false, error: "Invalid locked board." };
  }

  const next = cloneLockedBoard(lockedRaw);
  if (lockedBoardsEqual(player.lockedBoard, next)) {
    return { ok: true, room, states: broadcastStates(room) };
  }

  player.lockedBoard = next;
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
  if (room.vsComputer) {
    clearAutomationTimers(room);
    room.automationGen += 1;
    rooms.delete(room.code);
    return { ok: true, room, states: new Map(), deleteRoom: true };
  }

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
