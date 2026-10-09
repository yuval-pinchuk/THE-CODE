import { randomInt } from "node:crypto";
import type { Axis, Difficulty, Grid, HistoryEntry, LineValues } from "../shared/types.js";
import { getLine, scoreLine } from "./game.js";

export type BotAction =
  | { kind: "guess"; axis: Axis; index: number; values: LineValues }
  | { kind: "solve"; grid: Grid };

const AXES: { axis: Axis; index: number }[] = [
  { axis: "row", index: 0 },
  { axis: "row", index: 1 },
  { axis: "row", index: 2 },
  { axis: "col", index: 0 },
  { axis: "col", index: 1 },
  { axis: "col", index: 2 },
];

let allCodesCache: Grid[] | null = null;

function allCodes(): Grid[] {
  if (allCodesCache) return allCodesCache;
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const out: Grid[] = [];
  function perm(i: number) {
    if (i === digits.length) {
      out.push([
        [digits[0], digits[1], digits[2]],
        [digits[3], digits[4], digits[5]],
        [digits[6], digits[7], digits[8]],
      ]);
      return;
    }
    for (let j = i; j < digits.length; j++) {
      [digits[i], digits[j]] = [digits[j], digits[i]];
      perm(i + 1);
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
  }
  perm(0);
  allCodesCache = out;
  return out;
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function lineKey(axis: Axis, index: number, values: LineValues): string {
  return `${axis}:${index}:${values.join("")}`;
}

function consistentCodes(selfId: string, history: HistoryEntry[]): Grid[] {
  const guesses = history.filter(
    (entry): entry is HistoryEntry & { kind: "guess" } =>
      entry.kind === "guess" && entry.playerId === selfId,
  );
  return allCodes().filter((grid) =>
    guesses.every((guess) => {
      const truth = getLine(grid, guess.axis, guess.index);
      const score = scoreLine(guess.values, truth);
      return score.gold === guess.gold && score.silver === guess.silver;
    }),
  );
}

function randomLine(): LineValues {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  return [digits[0], digits[1], digits[2]];
}

function knownPerfect(history: HistoryEntry[], selfId: string): Set<string> {
  const keys = new Set<string>();
  for (const entry of history) {
    if (entry.kind === "guess" && entry.playerId === selfId && entry.gold === 3) {
      keys.add(`${entry.axis}:${entry.index}`);
    }
  }
  return keys;
}

function alreadyGuessed(history: HistoryEntry[], selfId: string): Set<string> {
  const keys = new Set<string>();
  for (const entry of history) {
    if (entry.kind === "guess" && entry.playerId === selfId) {
      keys.add(lineKey(entry.axis, entry.index, entry.values));
    }
  }
  return keys;
}

function guessFromCode(grid: Grid, axis: Axis, index: number): LineValues {
  return getLine(grid, axis, index);
}

function entropy(
  sample: Grid[],
  axis: Axis,
  index: number,
  values: LineValues,
): number {
  const buckets = new Map<string, number>();
  for (const grid of sample) {
    const score = scoreLine(values, getLine(grid, axis, index));
    const key = `${score.gold}:${score.silver}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  let h = 0;
  for (const count of buckets.values()) {
    const p = count / sample.length;
    h -= p * Math.log(p);
  }
  return h;
}

export function thinkDelayMs(difficulty: Difficulty, turnLimitSeconds: number): number {
  const range =
    difficulty === "easy" ? [2000, 4000] : difficulty === "hard" ? [600, 1200] : [1000, 2000];
  let ms = range[0] + Math.random() * (range[1] - range[0]);
  if (turnLimitSeconds > 0) {
    ms = Math.min(ms, Math.max(350, turnLimitSeconds * 1000 - 700));
  }
  return Math.round(ms);
}

export function chooseBotAction(
  difficulty: Difficulty,
  selfId: string,
  history: HistoryEntry[],
): BotAction {
  const candidates = consistentCodes(selfId, history);
  const pool = candidates.length > 0 ? candidates : allCodes();

  if (difficulty === "hard" && pool.length === 1) {
    return { kind: "solve", grid: pool[0] };
  }
  if (difficulty === "medium" && pool.length <= 2) {
    return { kind: "solve", grid: pool[randomInt(pool.length)] };
  }
  if (difficulty === "easy" && pool.length === 1) {
    return { kind: "solve", grid: pool[0] };
  }

  const seen = alreadyGuessed(history, selfId);
  const perfect = knownPerfect(history, selfId);
  const openLines = AXES.filter((line) => !perfect.has(`${line.axis}:${line.index}`));
  const lines = openLines.length > 0 ? openLines : AXES;

  if (difficulty === "hard") {
    const sample = pool.length > 160 ? shuffle(pool).slice(0, 160) : pool;
    let best: { score: number; axis: Axis; index: number; values: LineValues } | null = null;
    const probes = shuffle(sample).slice(0, 24);
    for (const grid of probes) {
      for (const line of lines) {
        const values = guessFromCode(grid, line.axis, line.index);
        if (seen.has(lineKey(line.axis, line.index, values))) continue;
        const score = entropy(sample, line.axis, line.index, values);
        if (!best || score > best.score) {
          best = { score, axis: line.axis, index: line.index, values };
        }
      }
    }
    if (best) {
      return { kind: "guess", axis: best.axis, index: best.index, values: best.values };
    }
  }

  const source = pool[randomInt(pool.length)];
  const ordered = shuffle(lines);
  for (const line of ordered) {
    const values = guessFromCode(source, line.axis, line.index);
    if (!seen.has(lineKey(line.axis, line.index, values))) {
      return { kind: "guess", axis: line.axis, index: line.index, values };
    }
  }

  const line = ordered[0];
  return { kind: "guess", axis: line.axis, index: line.index, values: randomLine() };
}
