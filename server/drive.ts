import type { PublicRoomState } from "../shared/types.js";
import { chooseBotAction, thinkDelayMs } from "./bot.js";
import {
  type Room,
  broadcastStates,
  clearAutomationTimers,
  getRoom,
  guessLine,
  isRoomPaused,
  skipExpiredTurn,
  solve,
  syncTurnDeadline,
} from "./rooms.js";

type OnUpdate = (room: Room, states: Map<string, PublicRoomState>) => void;

export function driveRoom(roomCode: string, onUpdate: OnUpdate): void {
  const room = getRoom(roomCode);
  if (!room) return;

  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }

  const previousDeadline = room.turnDeadline;
  syncTurnDeadline(room);
  if (room.turnDeadline !== previousDeadline) {
    onUpdate(room, broadcastStates(room));
  }

  if (
    room.phase === "playing" &&
    room.turnLimitSeconds > 0 &&
    room.turnDeadline &&
    room.turnClockKey &&
    room.turnPlayerId &&
    !isRoomPaused(room)
  ) {
    const clockKey = room.turnClockKey;
    const wait = Math.max(0, room.turnDeadline - Date.now());
    room.turnTimer = setTimeout(() => {
      const current = getRoom(roomCode);
      if (!current || current.turnClockKey !== clockKey) return;
      const result = skipExpiredTurn(roomCode);
      if (result.ok) onUpdate(result.room, result.states);
      driveRoom(roomCode, onUpdate);
    }, wait);
  }

  if (!room.vsComputer) return;
  const bot = room.players.find((p) => p.isBot);
  if (!bot || isRoomPaused(room)) return;
  if (room.phase !== "playing" || room.turnPlayerId !== bot.id || bot.hasSolved || bot.wantsRestart) {
    return;
  }

  const botKey = `${room.roundId}:${room.turnPlayerId}:${room.turnSerial}`;
  if (room.botTurnKey === botKey && room.botTimer) return;

  if (room.botTimer) clearTimeout(room.botTimer);
  room.botTurnKey = botKey;
  const delay = thinkDelayMs(room.difficulty ?? "medium", room.turnLimitSeconds);
  room.botTimer = setTimeout(() => {
    const current = getRoom(roomCode);
    if (!current || current.botTurnKey !== botKey) return;
    current.botTimer = null;
    const actor = current.players.find((p) => p.isBot);
    if (!actor || current.turnPlayerId !== actor.id || current.phase !== "playing") return;
    const action = chooseBotAction(current.difficulty ?? "medium", actor.id, current.history);
    const result =
      action.kind === "solve"
        ? solve(roomCode, actor.id, action.grid)
        : guessLine(roomCode, actor.id, action.axis, action.index, action.values);
    if (result.ok) onUpdate(result.room, result.states);
    driveRoom(roomCode, onUpdate);
  }, delay);
}

export function stopRoomAutomation(room: Room | undefined): void {
  if (!room) return;
  clearAutomationTimers(room);
  room.botTurnKey = null;
  room.turnClockKey = null;
}
