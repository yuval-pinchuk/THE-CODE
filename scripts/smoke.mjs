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

const start = await emit(a, "game:start");
if (!start.ok) throw new Error(start.error);

await emit(a, "game:setCode", { grid: codeA });
const playing = waitForState(b, (s) => s.phase === "playing");
await emit(b, "game:setCode", { grid: codeB });
const playState = await playing;
console.log("Playing, turn:", playState.turnPlayerId === joinB.playerId ? "Bob" : "Alice");

// Non-manager (Bob) goes first. Guess col A of Alice: truth is 1,4,7 — guess 3,2,6
const afterGuessP = waitForState(a, (s) => s.history.length === 1);
const guess = await emit(b, "game:guessLine", {
  axis: "col",
  index: 0,
  values: [3, 2, 6],
});
if (!guess.ok) throw new Error(guess.error);
const afterGuess = await afterGuessP;
const entry = afterGuess.history[0];
console.log("Guess result:", entry.label, entry.values, "gold", entry.gold, "silver", entry.silver);

// Alice's turn — wrong solve (her own code is not Bob's)
const afterWrongP = waitForState(b, (s) => s.history.some((h) => h.kind === "solve" && !h.correct));
const wrong = await emit(a, "game:solve", { grid: codeA });
if (!wrong.ok) throw new Error(wrong.error);
await afterWrongP;

// Bob solves correctly
const winWait = waitForState(b, (s) => s.phase === "finished");
const solve = await emit(b, "game:solve", { grid: codeA });
if (!solve.ok) throw new Error(solve.error);
const finished = await winWait;
console.log("Winner:", finished.winnerName, "phase", finished.phase);

if (finished.winnerId !== joinB.playerId) throw new Error("Expected Bob to win");

a.close();
b.close();
console.log("SMOKE OK");
process.exit(0);
