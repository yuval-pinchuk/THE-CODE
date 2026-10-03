import express from "express";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type {
  GuessLinePayload,
  JoinPayload,
  SetCodePayload,
  SolvePayload,
} from "../shared/types.js";
import {
  getConnectedSocketIds,
  guessLine,
  handleDisconnect,
  joinRoom,
  leaveRoom,
  requestRestart,
  setCode,
  startGame,
  solve,
  toPublicState,
} from "./rooms.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

type SocketData = {
  playerId?: string;
  roomCode?: string;
};

type AckFn = (res: unknown) => void;

function splitAck<T>(args: unknown[]): { payload: T; ack?: AckFn } {
  const last = args[args.length - 1];
  if (typeof last === "function") {
    return {
      payload: (args.length > 1 ? args[0] : undefined) as T,
      ack: last as AckFn,
    };
  }
  return { payload: args[0] as T };
}

function emitStates(
  roomCode: string,
  states: Map<string, ReturnType<typeof toPublicState>>,
): void {
  for (const { playerId, socketId } of getConnectedSocketIds(roomCode)) {
    const state = states.get(playerId);
    if (state) {
      io.to(socketId).emit("room:state", state);
    }
  }
}

io.on("connection", (socket) => {
  const data = socket.data as SocketData;

  socket.on("room:join", (...args: unknown[]) => {
    const { payload, ack } = splitAck<JoinPayload>(args);
    const result = joinRoom(
      payload?.roomCode ?? "",
      payload?.name ?? "",
      socket.id,
      payload?.playerId,
    );

    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    if (data.roomCode) {
      socket.leave(data.roomCode);
    }

    data.playerId = result.playerId;
    data.roomCode = result.room.code;
    socket.join(result.room.code);

    ack?.({ ok: true, playerId: result.playerId, state: result.state });

    emitStates(
      result.room.code,
      new Map(
        result.room.players.map((p) => [p.id, toPublicState(result.room, p.id)]),
      ),
    );
  });

  socket.on("room:leave", (...args: unknown[]) => {
    const { ack } = splitAck(args);
    if (!data.roomCode || !data.playerId) {
      ack?.({ ok: false, error: "Not in a room." });
      return;
    }
    const code = data.roomCode;
    const result = leaveRoom(code, data.playerId);
    socket.leave(code);
    data.roomCode = undefined;
    data.playerId = undefined;

    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    if (!result.deleteRoom) {
      emitStates(result.room.code, result.states);
    }
    ack?.({ ok: true });
  });

  socket.on("game:start", (...args: unknown[]) => {
    const { ack } = splitAck(args);
    if (!data.roomCode || !data.playerId) {
      ack?.({ ok: false, error: "Not in a room." });
      return;
    }
    const result = startGame(data.roomCode, data.playerId);
    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }
    emitStates(result.room.code, result.states);
    ack?.({ ok: true });
  });

  socket.on("game:setCode", (...args: unknown[]) => {
    const { payload, ack } = splitAck<SetCodePayload>(args);
    if (!data.roomCode || !data.playerId) {
      ack?.({ ok: false, error: "Not in a room." });
      return;
    }
    const result = setCode(data.roomCode, data.playerId, payload?.grid);
    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }
    emitStates(result.room.code, result.states);
    ack?.({ ok: true });
  });

  socket.on("game:guessLine", (...args: unknown[]) => {
    const { payload, ack } = splitAck<GuessLinePayload>(args);
    if (!data.roomCode || !data.playerId) {
      ack?.({ ok: false, error: "Not in a room." });
      return;
    }
    const result = guessLine(
      data.roomCode,
      data.playerId,
      payload?.axis,
      payload?.index,
      payload?.values,
    );
    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }
    emitStates(result.room.code, result.states);
    ack?.({ ok: true });
  });

  socket.on("game:solve", (...args: unknown[]) => {
    const { payload, ack } = splitAck<SolvePayload>(args);
    if (!data.roomCode || !data.playerId) {
      ack?.({ ok: false, error: "Not in a room." });
      return;
    }
    const result = solve(data.roomCode, data.playerId, payload?.grid);
    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }
    emitStates(result.room.code, result.states);
    ack?.({ ok: true });
  });

  socket.on("game:requestRestart", (...args: unknown[]) => {
    const { ack } = splitAck(args);
    if (!data.roomCode || !data.playerId) {
      ack?.({ ok: false, error: "Not in a room." });
      return;
    }
    const result = requestRestart(data.roomCode, data.playerId);
    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }
    emitStates(result.room.code, result.states);
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    handleDisconnect(
      socket.id,
      (room, states) => emitStates(room.code, states),
      () => {
        /* room deleted */
      },
    );
  });
});

const clientDist = path.join(__dirname, "../client");
const clientIndex = path.join(clientDist, "index.html");

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

if (existsSync(clientIndex)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(clientIndex);
  });
}

const PORT = Number(process.env.PORT) || 3000;

httpServer.listen(PORT, () => {
  console.log(`THE CODE server listening on :${PORT}`);
  if (existsSync(clientIndex)) {
    console.log(`Serving client from ${clientDist}`);
  }
});
