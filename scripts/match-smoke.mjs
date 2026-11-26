import { io } from "socket.io-client";

// Run against a fresh server: open random-match rooms left over from earlier
// runs can legitimately absorb these seekers.
const URL = process.env.SMOKE_URL || "http://localhost:3000";

const sockets = [];

function connect() {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ["websocket"] });
    s.on("connect", () => resolve(s));
    sockets.push(s);
  });
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

async function seek(name, players, timeChoice) {
  const socket = await connect();
  const res = await emit(socket, "match:find", { name, players, timeChoice });
  if (!res.ok) throw new Error(`${name}: ${res.error}`);
  return { socket, res, state: res.state, id: res.playerId };
}

function check(cond, message) {
  if (!cond) throw new Error(`FAILED: ${message}`);
  console.log("ok  -", message);
}

// 1. Two "Any" seekers share an undecided room and can start with 2 players.
const k1 = await seek("K1", "any", "any");
const k2 = await seek("K2", "any", "any");
check(k1.state.code === k2.state.code, "Any/Any seekers land in the same room");
check(k1.state.matchmade && k1.state.targetPlayers === null, "room starts undecided on size");
check(k1.state.turnLimitSeconds === 60, "undecided time defaults to 60s");
const startK = await emit(k1.socket, "game:start", {});
check(startK.ok, "undecided room can start with 2 players");

// 2. A specific seeker settles an undecided room; others with other sizes stay out.
const u1 = await seek("U1", "any", "any");
const u2 = await seek("U2", 6, "quick");
check(u1.state.code === u2.state.code, "specific seeker joins the undecided room");
check(u2.state.targetPlayers === 6, "joining locks the room to 6 players");
check(u2.state.turnLimitSeconds === 30, "joining locks the turn time to Quick (30s)");
const u3 = await seek("U3", 4, "quick");
check(u3.state.code !== u1.state.code, "a 4-player seeker does not join the 6-player room");
const u4 = await seek("U4", 6, "any");
check(u4.state.code === u1.state.code, "6/Any seeker joins the locked 6-player room");
check(u4.state.players.length === 3, "locked room now has 3 players");

// 3. Same specific wants match; first seeker is the manager.
const a = await seek("A", 2, "quick");
const b = await seek("B", 2, "quick");
check(a.state.code === b.state.code, "2/Quick seekers land in the same room");
check(
  b.state.players.find((p) => p.id === a.id)?.isManager === true &&
    b.state.players.find((p) => p.id === b.id)?.isManager === false,
  "first seeker is the manager",
);

// 4. Start is blocked until the chosen number of players is reached.
const c1 = await seek("C1", 3, "normal");
const c2 = await seek("C2", 3, "normal");
check(c1.state.code === c2.state.code, "3/Normal seekers share a room");
const tooEarly = await emit(c1.socket, "game:start", {});
check(
  !tooEarly.ok && /Waiting for 3 players/.test(tooEarly.error),
  `manager can't start at 2/3 (${tooEarly.error})`,
);
const turnChange = await emit(c1.socket, "game:setTurnLimit", { turnSeconds: 10 });
check(!turnChange.ok, "manager can't change turn time in a random game");
const c3 = await seek("C3", 3, "normal");
check(c3.state.code === c1.state.code, "third player joins the same room");
const startC = await emit(c1.socket, "game:start", {});
check(startC.ok, "manager can start once the room has 3 players");

// 5. Different specific wants never share a room.
const q1 = await seek("Q1", 5, "quick");
const r1 = await seek("R1", 5, "relaxed");
check(q1.state.code !== r1.state.code, "5/Quick and 5/Relaxed get different rooms");
const n1 = await seek("N1", 5, "none");
check(
  n1.state.code !== q1.state.code && n1.state.code !== r1.state.code,
  "5/No limit gets its own room",
);

// 6. An Any/Any seeker joins an existing open room instead of creating one.
const any = await seek("Anyone", "any", "any");
check(any.state.players.length >= 2, "Any/Any seeker joins an existing room");

// 7. A full room is closed to joining by code.
const lateJoin = await emit(await connect(), "room:join", {
  roomCode: a.state.code,
  name: "Late",
});
check(!lateJoin.ok && /full/i.test(lateJoin.error), `full room refuses code joins (${lateJoin.error})`);

// 8. Bad input is rejected.
const bad = await emit(await connect(), "match:find", { name: "Bad", players: 9, timeChoice: "quick" });
check(!bad.ok, "player count outside 2 to 8 is rejected");
const badTime = await emit(await connect(), "match:find", { name: "Bad", players: 2, timeChoice: "soon" });
check(!badTime.ok, "unknown time choice is rejected");

console.log("MATCH SMOKE OK");
for (const s of sockets) s.close();
process.exit(0);
