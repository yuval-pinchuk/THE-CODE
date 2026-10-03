# THE CODE

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
