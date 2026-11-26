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
  /** Codes of players who left, still being solved by someone. */
  ghostTargets: { id: string; name: string }[];
  /** True for rooms created by "Join random game". */
  matchmade: boolean;
  /** Players needed before the manager can start; null when undecided or not matchmade. */
  targetPlayers: number | null;
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

export interface KickPlayerPayload {
  playerId: string;
}

/** Coarse turn-time preference for random matchmaking. "any" = don't mind. */
export type TimeChoice = "none" | "quick" | "normal" | "relaxed" | "any";

export const TIME_CHOICES: {
  id: TimeChoice;
  label: string;
  sublabel: string;
  /** Turn limit in seconds for this choice; null for "any". */
  seconds: number | null;
}[] = [
  { id: "none", label: "No limit", sublabel: "Take your time", seconds: 0 },
  { id: "quick", label: "Quick", sublabel: "~30 sec", seconds: 30 },
  { id: "normal", label: "Normal", sublabel: "~1 min", seconds: 60 },
  { id: "relaxed", label: "Relaxed", sublabel: "~2 min", seconds: 120 },
  { id: "any", label: "Any", sublabel: "Don’t mind", seconds: null },
];

/** Room size preference for random matchmaking: 2 to 8, or "any". */
export type PlayerChoice = number | "any";

export const MATCH_MIN_PLAYERS = 2;
export const MATCH_MAX_PLAYERS = 8;

export interface FindMatchPayload {
  name: string;
  players: PlayerChoice;
  timeChoice: TimeChoice;
}

export const ROW_LABELS = ["X", "Y", "Z"] as const;
export const COL_LABELS = ["A", "B", "C"] as const;

export function lineLabel(axis: Axis, index: number): string {
  return axis === "row" ? ROW_LABELS[index] : COL_LABELS[index];
}
