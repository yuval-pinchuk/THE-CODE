import { io, Socket } from "socket.io-client";
import type {
  GuessLinePayload,
  JoinPayload,
  PublicRoomState,
  SetCodePayload,
  SolvePayload,
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
});

function emitAck<T>(event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload, (err: Error | null, res: Ack<T>) => {
      if (err) {
        resolve({ ok: false, error: "Connection timed out. Try again." });
        return;
      }
      resolve(res ?? { ok: false, error: "No response from server." });
    });
  });
}

export function joinRoom(payload: JoinPayload) {
  return emitAck("room:join", payload);
}

export function leaveRoom() {
  return emitAck("room:leave", {});
}

export function startGame() {
  return emitAck("game:start", {});
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
