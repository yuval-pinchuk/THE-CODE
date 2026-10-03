const NOTES_PREFIX = "ofiny_notes_";
const COIN_MARKS_PREFIX = "ofiny_coinmarks_";

export type CoinMarks = {
  gold: (number | null)[];
  silver: (number | null)[];
};

export type CoinMarksMap = Record<string, CoinMarks>;

export function notesStorageKey(roomCode: string, playerId: string, roundId: string) {
  return `${NOTES_PREFIX}${roomCode}_${playerId}_${roundId}`;
}

export function coinMarksStorageKey(roomCode: string, playerId: string, roundId: string) {
  return `${COIN_MARKS_PREFIX}${roomCode}_${playerId}_${roundId}`;
}

export function loadCoinMarks(storageKey: string): CoinMarksMap {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CoinMarksMap;
  } catch {
    return {};
  }
}

export function saveCoinMarks(storageKey: string, marks: CoinMarksMap) {
  localStorage.setItem(storageKey, JSON.stringify(marks));
}

export function emptyCoinMarks(gold: number, silver: number): CoinMarks {
  return {
    gold: Array.from({ length: gold }, () => null),
    silver: Array.from({ length: silver }, () => null),
  };
}

/** Normalize stored marks to match current gold/silver counts for a guess. */
export function normalizeCoinMarks(
  marks: CoinMarks | undefined,
  gold: number,
  silver: number,
): CoinMarks {
  const base = emptyCoinMarks(gold, silver);
  if (!marks) return base;
  for (let i = 0; i < gold; i++) {
    base.gold[i] = marks.gold?.[i] ?? null;
  }
  for (let i = 0; i < silver; i++) {
    base.silver[i] = marks.silver?.[i] ?? null;
  }
  return base;
}

/** Remove all deduction-board and coin-mark keys for a room (any player/round). */
export function clearRoomNotes(roomCode: string) {
  const prefixes = [`${NOTES_PREFIX}${roomCode}_`, `${COIN_MARKS_PREFIX}${roomCode}_`];
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && prefixes.some((p) => key.startsWith(p))) toRemove.push(key);
  }
  for (const key of toRemove) localStorage.removeItem(key);
}
