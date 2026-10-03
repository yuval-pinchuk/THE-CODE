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
console.log(
  "Assignments:",
  setupState.assignments.map((e) => `${e.fromId.slice(0, 4)}→${e.toId.slice(0, 4)}`).join(", "),
);
console.log("Alice target:", setupState.yourTargetName);

const playing = waitForState(b, (s) => s.phase === "playing");
await emit(a, "game:setCode", { grid: codeA });
await emit(b, "game:setCode", { grid: codeB });
const playState = await playing;
console.log("Playing, turn:", playState.turnPlayerId === joinB.playerId ? "Bob" : "Alice");

// With 2 players, derangement is A→B and B→A. Non-manager goes first.
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
const afterGuess = await afterGuessP;
const entry = afterGuess.history[0];
console.log("Guess result:", entry.label, entry.values, "gold", entry.gold, "silver", entry.silver);

const afterWrongP = waitForState(firstSocket, (s) =>
  s.history.some((h) => h.kind === "solve" && !h.correct),
);
const wrong = await emit(secondSocket, "game:solve", { grid: secondOwnCode });
if (!wrong.ok) throw new Error(wrong.error);
await afterWrongP;

const celebWait = waitForState(firstSocket, (s) => s.celebration && s.phase === "playing");
const solve = await emit(firstSocket, "game:solve", { grid: targetCode });
if (!solve.ok) throw new Error(solve.error);
const celebrated = await celebWait;
console.log(
  "Celebration:",
  celebrated.celebration.solverName,
  "→",
  celebrated.celebration.targetName,
  "unsolved",
  celebrated.unsolvedCount,
);

if (celebrated.celebration.solverId !== firstId) {
  throw new Error("Expected first player to be the solver");
}
if (celebrated.unsolvedCount !== 1) {
  throw new Error("Expected one unsolved player left");
}

// Continue should fail when only one unsolved
const cont = await emit(firstSocket, "game:continue", {});
if (cont.ok) throw new Error("Continue should be blocked when unsolvedCount <= 1");

const restartWait = waitForState(secondSocket, (s) => s.phase === "setup" && !s.celebration);
const restart = await emit(firstSocket, "game:restart", {});
if (!restart.ok) throw new Error(restart.error);
const restarted = await restartWait;
if (!restarted.yourTargetId) throw new Error("Expected new target after restart");
console.log("Restarted to setup, new target:", restarted.yourTargetName);

a.close();
b.close();
console.log("SMOKE OK");
process.exit(0);
