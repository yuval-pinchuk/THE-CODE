export type Phase = "lobby" | "setup" | "playing" | "finished";

export type Axis = "row" | "col";

export type Grid = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export type LineValues = [number, number, number];

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  hasCode: boolean;
  isManager: boolean;
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
  correct: boolean;
}

export type HistoryEntry =
  | ({ kind: "guess" } & GuessHistoryEntry)
  | ({ kind: "solve" } & SolveHistoryEntry);

export interface PublicRoomState {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  turnPlayerId: string | null;
  history: HistoryEntry[];
  winnerId: string | null;
  winnerName: string | null;
  yourGrid: Grid | null;
  paused: boolean;
  message: string | null;
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

export const ROW_LABELS = ["X", "Y", "Z"] as const;
export const COL_LABELS = ["A", "B", "C"] as const;

export function lineLabel(axis: Axis, index: number): string {
  return axis === "row" ? ROW_LABELS[index] : COL_LABELS[index];
}
