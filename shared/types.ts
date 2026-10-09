export type Phase = "lobby" | "setup" | "playing" | "finished";

export type Axis = "row" | "col";

export type Grid = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export type LineValues = [number, number, number];

/** Digits a player has committed as large on their deduction board (null = empty). */
export type LockedBoard = [
  [number | null, number | null, number | null],
  [number | null, number | null, number | null],
  [number | null, number | null, number | null],
];

export type PlayerSeat = "playing" | "waitingRestart";

export type Difficulty = "easy" | "medium" | "hard";

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  hasCode: boolean;
  hasSolved: boolean;
  wantsRestart: boolean;
  isManager: boolean;
  isBot: boolean;
}

export interface AssignmentEdge {
  fromId: string;
  toId: string;
}

export interface CelebrationState {
  id: string;
  solverId: string;
  solverName: string;
  targetId: string;
  targetName: string;
}

export interface GuessHistoryEntry {
  id: string;
  playerId: string;
  playerName: string;
  axis: Axis;
  index: number;
  label: string;
  values: LineValues;
  gold: number;
  silver: number;
}

export interface SolveHistoryEntry {
  id: string;
  playerId: string;
  playerName: string;
  targetId: string;
  targetName: string;
  correct: boolean;
}

export type HistoryEntry =
  | ({ kind: "guess" } & GuessHistoryEntry)
  | ({ kind: "solve" } & SolveHistoryEntry);

export interface PublicRoomState {
  code: string;
  phase: Phase;
  /** Changes each start/restart so clients reset local notes. */
  roundId: string | null;
  players: PublicPlayer[];
  turnPlayerId: string | null;
  history: HistoryEntry[];
  assignments: AssignmentEdge[];
  yourTargetId: string | null;
  yourTargetName: string | null;
  yourSeat: PlayerSeat;
  celebration: CelebrationState | null;
  unsolvedCount: number;
  yourGrid: Grid | null;
  /** Large locked digits each player has published from their deduction board. */
  playerLockedBoards: Record<string, LockedBoard>;
  paused: boolean;
  message: string | null;
  vsComputer: boolean;
  difficulty: Difficulty | null;
  /** 0 means no turn clock. */
  turnLimitSeconds: number;
  /** Epoch ms when the current turn expires, or null. */
  turnDeadline: number | null;
}

export interface JoinPayload {
  roomCode: string;
  name: string;
  playerId?: string;
}

export interface GuessLinePayload {
  axis: Axis;
  index: number;
  values: LineValues;
}

export interface SetCodePayload {
  grid: Grid;
}

export interface SolvePayload {
  grid: Grid;
}

export interface UpdateLockedBoardPayload {
  locked: LockedBoard;
}

export interface VsComputerPayload {
  name: string;
  difficulty: Difficulty;
  turnSeconds: number;
}

export interface StartGamePayload {
  difficulty?: Difficulty;
  turnSeconds?: number;
}

export interface SetTurnLimitPayload {
  turnSeconds: number;
}

export const ROW_LABELS = ["X", "Y", "Z"] as const;
export const COL_LABELS = ["A", "B", "C"] as const;

export function lineLabel(axis: Axis, index: number): string {
  return axis === "row" ? ROW_LABELS[index] : COL_LABELS[index];
}
