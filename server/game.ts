import { randomInt } from "node:crypto";
import type { Axis, Grid, LineValues } from "../shared/types.js";

export function emptyGrid(): (number | null)[][] {
  return [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
}

export function isValidCode(grid: unknown): grid is Grid {
  if (!Array.isArray(grid) || grid.length !== 3) return false;
  const flat: number[] = [];
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== 3) return false;
    for (const cell of row) {
      if (typeof cell !== "number" || !Number.isInteger(cell) || cell < 1 || cell > 9) {
        return false;
      }
      flat.push(cell);
    }
  }
  return new Set(flat).size === 9;
}

export function isValidLineValues(values: unknown): values is LineValues {
  if (!Array.isArray(values) || values.length !== 3) return false;
  const nums: number[] = [];
  for (const v of values) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 9) return false;
    nums.push(v);
  }
  return new Set(nums).size === 3;
}

export function getLine(grid: Grid, axis: Axis, index: number): LineValues {
  if (axis === "row") {
    return [grid[index][0], grid[index][1], grid[index][2]];
  }
  return [grid[0][index], grid[1][index], grid[2][index]];
}

/** Mastermind-style gold/silver on a 3-cell line. */
export function scoreLine(guess: LineValues, truth: LineValues): { gold: number; silver: number } {
  let gold = 0;
  const guessRest: number[] = [];
  const truthRest: number[] = [];

  for (let i = 0; i < 3; i++) {
    if (guess[i] === truth[i]) {
      gold++;
    } else {
      guessRest.push(guess[i]);
      truthRest.push(truth[i]);
    }
  }

  let silver = 0;
  for (const g of guessRest) {
    const idx = truthRest.indexOf(g);
    if (idx !== -1) {
      silver++;
      truthRest.splice(idx, 1);
    }
  }

  return { gold, silver };
}

export function gridsEqual(a: Grid, b: Grid): boolean {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

export function randomCode(): Grid {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return [
    [digits[0], digits[1], digits[2]],
    [digits[3], digits[4], digits[5]],
    [digits[6], digits[7], digits[8]],
  ];
}

export function cloneGrid(grid: Grid): Grid {
  return [
    [grid[0][0], grid[0][1], grid[0][2]],
    [grid[1][0], grid[1][1], grid[1][2]],
    [grid[2][0], grid[2][1], grid[2][2]],
  ];
}
