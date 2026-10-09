import { io, Socket } from "socket.io-client";
import type {
  Difficulty,
  GuessLinePayload,
  JoinPayload,
  PublicRoomState,
  SetCodePayload,
  SolvePayload,
  UpdateLockedBoardPayload,
} from "@shared/types";

export type Ack<T = unknown> =
  | { ok: true; playerId?: string; state?: PublicRoomState }
  | { ok: false; error: string };

const URL =
  import.meta.env.PROD
    ? window.location.origin
    : "http://localhost:3000";

export const socket: Socket = io(URL, {
  autoConnect: true,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

/** Ensure the socket is connecting/connected (e.g. after mobile backgrounding). */
export function ensureConnected() {
  if (!socket.connected) socket.connect();
}

function emitAck<T>(event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve({ ok: false, error: "Not connected. Try again." });
      return;
    }
    const cb = (err: Error | null, res: Ack<T>) => {
      if (err) {
        resolve({ ok: false, error: "Connection timed out. Try again." });
        return;
      }
      resolve(res ?? { ok: false, error: "No response from server." });
    };
    if (payload === undefined) {
      socket.timeout(8000).emit(event, cb);
    } else {
      socket.timeout(8000).emit(event, payload, cb);
    }
  });
}

export function joinRoom(payload: JoinPayload) {
  return emitAck("room:join", payload);
}

export function leaveRoom() {
  return emitAck("room:leave", {});
}

export function startGame(payload?: { difficulty?: Difficulty; turnSeconds?: number }) {
  return emitAck("game:start", payload ?? {});
}

export function startVsComputer(payload: {
  name: string;
  difficulty: Difficulty;
  turnSeconds: number;
}) {
  return emitAck("game:vsComputer", payload);
}

export function setTurnLimit(turnSeconds: number) {
  return emitAck("game:setTurnLimit", { turnSeconds });
}

export function setCode(payload: SetCodePayload) {
  return emitAck("game:setCode", payload);
}

export function guessLine(payload: GuessLinePayload) {
  return emitAck("game:guessLine", payload);
}

export function solveCode(payload: SolvePayload) {
  return emitAck("game:solve", payload);
}

export function requestRestart() {
  return emitAck("game:requestRestart", {});
}

export function updateLockedBoard(payload: UpdateLockedBoardPayload) {
  return emitAck("notes:updateLocked", payload);
}

export function onRoomState(handler: (state: PublicRoomState) => void) {
  socket.on("room:state", handler);
  return () => {
    socket.off("room:state", handler);
  };
}

export function onConnect(handler: () => void) {
  socket.on("connect", handler);
  return () => {
    socket.off("connect", handler);
  };
}
