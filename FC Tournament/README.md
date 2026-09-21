# ⚽ FC Mobile League Manager

A complete tournament manager for FC Mobile leagues: **World Cup–style groups**, automatic
points tables, **admin-chosen qualify counts + wildcards**, dynamic **knockout brackets**,
per-team **advice for next tournaments**, and — new in v2 — a **shared multi-user website**
with **per-admin accounts**, a **live change feed**, and **real-time updates** for every viewer.

---

## Two ways to use it

### 🖥️ 1. Local / single-file (offline)

- Just open `index.html` in any browser (double-click it).
- No server needed. Data is saved in that browser (localStorage).
- Admin access: **PIN `qwert`** (top-right → 🔐 Admin Login).
- Good for one organiser on one machine.

### 🌐 2. Shared website (multi-user)

- Run `node server.js` (or `npm start`) and the same app becomes a website everyone can open.
- **Admins have their own accounts** (username + password). Anyone else is read-only.
- All admins edit the **same** data; every change is saved on the server and
  **shown live to everyone** (via Server-Sent Events — no page refresh needed).
- A **🕓 Recent changes** feed on the dashboard shows *who changed what and when*.

---

## 🔐 Accounts (website mode)

- **First admin** is created automatically on first launch from the environment
  (default: user `admin` / password `qwert` — **change these when deploying for real**).
- The first admin can add more admins from the dashboard: **➕ Add Admin**
  (username, password, optional display name). New admins just log in from any device.
- **Every save is logged** in the change feed with the admin's display name.
- Sessions last 30 days; use **Logout** on shared computers.

---

## 🏟️ Features

### Multiple tournaments at once
- Create unlimited leagues on the dashboard (e.g. "Premier League", "Weekend Cup").
- Each tournament has its own teams, results, table and knockout bracket.

### World Cup–style groups
- Every tournament starts with a **Group A**; add as many as needed (B, C, D, …) — auto-named.
- Groups can be **renamed, deleted**, and teams **moved** between them.
- Each group has its **own automatic points table** (Win 3, Draw 1, Loss 0).

### Round-robin with automatic points table
- Record results (pick a group, then two teams). The table updates automatically:

| Stat | Meaning |
|------|---------|
| P / W / D / L | Played / Wins / Draws / Losses |
| GF / GA / GD | Goals For / Against / Difference |
| Pts | **Win = 3, Draw = 1, Loss = 0** |

- Ranking: **Points → Goal Difference → Goals For** (then name). Rows in the
  **QUALIFY** zone are the teams that go through (green highlight).

### 🏅 Overall Rankings + advice
- The 🏅 **Rankings** tab lists every team everywhere: combined standings with all stats,
  medals 🥇🥈🥉, group tag, and qualified/champion markers.
- Every team gets **personal advice for the next tournament** from their real stats.

### 🎉 Winner animations
- Golden shimmer + pulse for knockout winners, WINNER stamps, bouncing trophies,
  and confetti 🎊 for the champion (disabled automatically for reduced-motion users).

### Knockouts: you choose the format
- Admin decides **how many qualify from each group** and **wildcard top-ups**
  (e.g. "best third-placed teams") up to a bracket of **2 / 4 / 8 / 16 / 32**.
- Rounds are derived automatically: 8 teams → QF → SF → Final; 16 → R16 → QF → SF → Final; etc.
- Qualifiers are **pre-filled automatically** (winners, runners-up, then wildcards by points);
  the admin can override any pick before creating the bracket.
- Optional **penalty shootouts** for tied knockout games; winners auto-advance;
  the Champion gets a trophy banner.

### Admin controls
- Create / rename / delete tournaments; add / rename / delete groups; add / remove / move teams.
- Record, edit, delete match results per group; choose qualify counts + wildcards;
  build, edit and reset the knockout bracket.
- **Export Backup** (download JSON) / **Import Backup** (restore or migrate into the shared site).

---

## 🌍 Deploying (make it a proper website)

Two runtime profiles are included — pick whichever fits your free-host:

| | Long-running host (Render / Railway / VPS) | Vercel (serverless) |
|---|---|---|
| Server entry | `server.js` (already there) | `api/[...all].js` (already there) |
| Data storage | `DATA_DIR` JSON files | Upstash Redis (free tier) |
| Live updates for viewers | **Instant** (SSE push) | Every ~4 s (automatic polling) |
| Code changes needed | None | None |

On either one, **anyone with the link sees admin changes live** — only logged-in admins
can edit — plus the 🕓 Recent changes feed shows *who changed what*.

### Option A — Vercel (free, quick public URL) ⭐
1. Create a free **Upstash Redis** database → open the **REST API** tab →
   copy the **REST URL** and **REST Token**.
2. Push this folder to a GitHub repo. The `api/` folder and `vercel.json` are pre-configured.
3. On Vercel: **Add New → Project → Import** the repo.
   Framework preset: **Other** · no build step, no start command needed.
4. Add these **Environment Variables**:
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (from step 1)
   - `SECRET` — a random string (keeps admin sessions valid across redeploys)
   - `ADMIN_USER` / `ADMIN_PASSWORD` — the first admin (default `admin` / `qwert`)
5. **Deploy** → you get `https://your-league.vercel.app`. Share it with everyone.
6. Log in as the first admin and add the other admins from the dashboard (➕ Add Admin).

> On Vercel the browser polls `/api/state` every ~4 seconds, so another admin's change
> appears almost immediately and the Recent changes feed refreshes on its own.

### Option B — Render.com (free, instant push) 
1. Push this folder to a GitHub repo.
2. On Render: **New → Web Service**, pick the repo.
3. Build command: leave empty · Start command: `node server.js`.
4. Add env vars `ADMIN_USER` and `ADMIN_PASSWORD` (strong password!) and `SECRET`.
5. Deploy — Render gives you a public HTTPS URL like `https://your-league.onrender.com`.
6. Optional: add a **Persistent Disk** mounted at `/data` so data survives redeploys.

### Option C — Railway / Fly.io / other Node hosts
Same idea: run `node server.js`, set the env vars below, and attach a volume to `DATA_DIR`
if the host supports persistent storage.

### Option D — a server you control (VPS / shared host)
```bash
ADMIN_USER=myadmin ADMIN_PASSWORD='a-strong-password' SECRET='some-random-string' node server.js
```
Put it behind HTTPS (Caddy, Nginx + certbot) so the admin login travels encrypted.

### Run locally & share temporarily
```bash
npm start        # or: node server.js   →  http://localhost:8123
```
For a quick public link while your PC is on (e.g. to test with admins), use a tunnel:
`npx --yes localtunnel --port 8123` or `cloudflared tunnel --url http://localhost:8123`.

### Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `8123` | HTTP port (long-running hosts) |
| `DATA_DIR` | `./data` | Folder for `db.json` + `users.json` (long-running hosts) |
| `ADMIN_USER` | `admin` | First admin username (created on first launch) |
| `ADMIN_PASSWORD` | `qwert` | First admin password — **set a real one in production** |
| `SECRET` | dev-only | Random string for admin sessions — set it in production |
| `OPEN_BROWSER` | `1` | Set `0` to disable auto-opening a browser on `npm start` |
| `UPSTASH_REDIS_REST_URL` | – | Redis REST URL (Vercel only) |
| `UPSTASH_REDIS_REST_TOKEN` | – | Redis REST token (Vercel only) |
| `REDIS_PREFIX` | `fcm:` | Key prefix for Redis (Vercel only) |

> 💡 **Data**: long-running hosts keep everything in `DATA_DIR`
> (`db.json` + `users.json`) — back those up. On Vercel the data lives in your
> Upstash Redis DB instead.
>
> ⚠️ If you ever change `SECRET`, every admin simply logs in again (sessions are
> signed tokens with a 30-day expiry). That's normal and safe.

---

## 🧪 Tests

```bash
npm test
```

Runs four suites (zero external dependencies):

| Suite | What it covers |
|-------|----------------|
| `test.js` | App logic: groups, tables, qualify counts, wildcards, seeding, brackets, auto-advance, migration, rankings, advice |
| `render-smoke.js` | Rendering: read-only + admin views, brackets, animations markup |
| `api-test.js` | Backend: signed sessions (login/logout/verify), public read, shared saves, change feed, admin-created accounts, SSE broadcasts, Redis storage adapter (via mock REST) |
| `sync-test.js` | Browser↔server sync: SSE host (instant push) + serverless host (Vercel-style polling), login, authenticated saves, live updates, activity feed, no-render-when-unchanged |

---

## Tips
- Teams with 0 goals: enter `0` — numbers are fine left as-is.
- You can't record the same exact fixture twice; use **Edit** to change a score.
- Use **Export Backup** before a knockout reset to keep a safety copy.
- On the shared site, **log out** on shared computers; use the 🕓 feed to see what other admins did.