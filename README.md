# PIN CODE

Mobile-first 1v1 code deduction game. Players hide a 3×3 grid using digits 1–9 once each, then take turns guessing rows/columns for gold & silver coins — or attempt a full-grid solve to win.

## Local development

```bash
npm install
npm run dev
```

- Client: http://localhost:5173  
- Server: http://localhost:3000 (Socket.IO; Vite proxies `/socket.io`)

Open two browser tabs, join the same 4-digit room code, and play.

## Production build

```bash
npm install
npm run build
npm start
```

Serves the Vite client and Socket.IO from one Node process on `PORT` (default 3000).

## Deploy on Render (free)

1. Push this repo to GitHub.
2. In Render: **New → Web Service** → connect the repo.
3. Settings:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Deploy, then open the service URL on your phone.

Notes:

- Free instances spin down when idle; the first request after sleep can take ~30–60s.
- Rooms are in-memory only — they reset when the service restarts or sleeps.

## Join random game

From the home screen, **Join random game** asks for a player count (2–8 or Any) and a turn time (No limit, Quick ~30s, Normal ~1 min, Relaxed ~2 min, or Any). The server puts you in an open room with the same choices (Any matches everything) or creates one with you as manager. Once a room's player count is fixed, the manager can only start when that many players are connected. Turn time is fixed by matchmaking. Run `npm run smoke:match` against a fresh server to check the matching rules.

## Turn alerts (Web Push)

Players can tap **Turn alerts** to get a notification when it's their turn while they've left the app. The server pings them only when they're disconnected and it's their turn.

Set these environment variables on the server (e.g. Render → Environment) so keys stay the same across restarts:

- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: generate once with `npx web-push generate-vapid-keys`.
- `VAPID_SUBJECT` (optional): a `mailto:` address for your contact, e.g. `mailto:you@example.com`.

Without the keys the server still runs, but it uses temporary keys and logs a warning.

iPhone: turn alerts only work after **Share → Add to Home Screen** and opening the app from the Home Screen (iOS 16.4+).
