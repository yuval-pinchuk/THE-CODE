import { io } from "socket.io-client";

const URL = process.env.SMOKE_URL || "http://localhost:3000";

function connect() {
  return io(URL, { transports: ["websocket"] });
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

function waitForState(socket, predicate, ms = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("state timeout")), ms);
    const handler = (state) => {
      if (predicate(state)) {
        clearTimeout(t);
        socket.off("room:state", handler);
        resolve(state);
      }
    };
    socket.on("room:state", handler);
  });
}

const codeA = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];
const codeB = [
  [2, 5, 7],
  [3, 4, 1],
  [6, 9, 8],
];

const roomCode = String(Math.floor(1000 + Math.random() * 9000));

const a = connect();
const b = connect();

await Promise.all([
  new Promise((r) => a.on("connect", r)),
  new Promise((r) => b.on("connect", r)),
]);

const joinA = await emit(a, "room:join", { roomCode, name: "Alice" });
if (!joinA.ok) throw new Error(joinA.error);
console.log("Alice joined", roomCode, "manager?", joinA.state.players[0].isManager);

const joinB = await emit(b, "room:join", { roomCode, name: "Bob" });
if (!joinB.ok) throw new Error(joinB.error);
console.log("Bob joined, players:", joinB.state.players.length);

const setupA = waitForState(a, (s) => s.phase === "setup" && s.yourTargetId);
const start = await emit(a, "game:start");
if (!start.ok) throw new Error(start.error);
const setupState = await setupA;
console.log("Alice target:", setupState.yourTargetName);

const playing = waitForState(b, (s) => s.phase === "playing");
await emit(a, "game:setCode", { grid: codeA });
await emit(b, "game:setCode", { grid: codeB });
const playState = await playing;
console.log("Playing, turn:", playState.turnPlayerId === joinB.playerId ? "Bob" : "Alice");

const firstId = playState.turnPlayerId;
const firstSocket = firstId === joinA.playerId ? a : b;
const secondSocket = firstId === joinA.playerId ? b : a;
const secondId = firstId === joinA.playerId ? joinB.playerId : joinA.playerId;
const secondOwnCode = secondId === joinA.playerId ? codeA : codeB;
const firstTarget = playState.assignments.find((e) => e.fromId === firstId)?.toId;
const targetCode = firstTarget === joinA.playerId ? codeA : codeB;

const afterGuessP = waitForState(secondSocket, (s) => s.history.length === 1);
const guess = await emit(firstSocket, "game:guessLine", {
  axis: "col",
  index: 0,
  values: [3, 2, 6],
});
if (!guess.ok) throw new Error(guess.error);
await afterGuessP;

const afterWrongP = waitForState(firstSocket, (s) =>
  s.history.some((h) => h.kind === "solve" && !h.correct),
);
const wrong = await emit(secondSocket, "game:solve", { grid: secondOwnCode });
if (!wrong.ok) throw new Error(wrong.error);
await afterWrongP;

const celebWait = waitForState(firstSocket, (s) => s.celebration?.id && s.phase === "playing");
const solve = await emit(firstSocket, "game:solve", { grid: targetCode });
if (!solve.ok) throw new Error(solve.error);
const celebrated = await celebWait;
console.log(
  "Celebration:",
  celebrated.celebration.solverName,
  "→",
  celebrated.celebration.targetName,
  "id",
  celebrated.celebration.id.slice(0, 8),
);

// Celebration must not block the other player's turn (they may still be unsolved).
if (celebrated.turnPlayerId !== secondId) {
  // With 2p, after first solves only second remains active — turn should be second.
  if (celebrated.unsolvedCount !== 1) {
    throw new Error("Expected one unsolved player");
  }
}

// One player requesting restart must NOT start a new round alone.
const oneRestartWait = waitForState(secondSocket, (s) =>
  s.players.some((p) => p.id === firstId && p.wantsRestart) && s.phase === "playing",
);
const oneRestart = await emit(firstSocket, "game:requestRestart", {});
if (!oneRestart.ok) throw new Error(oneRestart.error);
const afterOne = await oneRestartWait;
if (afterOne.phase !== "playing") {
  throw new Error("Single restart request should not flip to setup");
}
console.log("First player waiting to restart; phase still playing");

// Second player also requests restart → setup for both.
const setupWait = waitForState(secondSocket, (s) => s.phase === "setup" && s.yourTargetId);
const twoRestart = await emit(secondSocket, "game:requestRestart", {});
if (!twoRestart.ok) throw new Error(twoRestart.error);
const restarted = await setupWait;
if (!restarted.yourTargetId) throw new Error("Expected new target after both restart");
console.log("Both requested restart → setup, target:", restarted.yourTargetName);

a.close();
b.close();
console.log("SMOKE OK");
process.exit(0);
