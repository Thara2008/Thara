# ⚽ Ceylon FC — FC Mobile League

The official **Ceylon FC** league website: a complete tournament manager and club newsroom for
FC Mobile leagues, built around **World Cup–style groups**, automatic points tables,
**admin-chosen qualify counts + wildcards**, dynamic **knockout brackets**, and per-team
**advice for next tournaments** — plus a **shared multi-user website** with **per-admin accounts**,
a **live change feed**, and **real-time updates** for every viewer.

## 🧭 Website tabs

| Tab | What it shows |
|-----|---------------|
| 🏠 **Home** | Hero + season, announcement banner, next fixtures, latest news, honours, open poll, Player of the Month and recent changes |
| 🏆 **League** | The full tournament manager — groups, tables, rankings, matches and knockouts |
| 📅 **Fixtures** | Every upcoming tie and recorded result, kickoff times in the visitor's local time zone, `.ics` calendar downloads and match reports |
| 📰 **News** | Club stories, match reports, announcements, transfers and interviews with categories, cover images and share links |
| 🎮 **Fan Zone** | Predictions, one-vote MOTM, fantasy Team of the Week and public polls |
| 👟 **Players** | Player profiles with XP, levels, automatic/manual badges and season stats |
| ⚡ **Power** | Admin-written power rankings with rise/fall arrows |
| 🏅 **Honours** | Animated club honours, every Ceylon FC champion and the full champion history |
| 📖 **About** | Club story, mission, league format, staff, contact/social links and sponsors (admins can edit everything, including the club crest) |

Tabs switch instantly without a reload and remember the last one you visited. Every feature has a
shareable hash route: `#home`, `#league`, `#fixtures`, `#news`, `#fans`, `#players`, `#power`,
`#hall`, `#about`, plus `#news/<id>`, `#match/<matchKey>` and `#player/<id>` detail pages.
Fan Zone subroutes are `#predict`, `#motm`, `#fantasy` and `#polls`.

The header also has a **global search bar**. It searches every team and shows that team's **next
fixture** plus the matching fixtures/results, players, news stories, tournaments and site pages.
Results are keyboard accessible and update as you type.

---

## Two ways to use it

### 🖥️ 1. Local / single-file (offline)

- Just open `index.html` in any browser (double-click it).
- No server needed. League data and local admin accounts are saved in that browser
  (localStorage).
- Admin access uses a **username + password** (top-right → 🔐 Admin Login), not a shared PIN.
- Good for one organiser on one machine.
- ⚠️ Browser-only account checks are **convenience protection, not real security**. Anyone with
  access to the device/browser can bypass them. Use the hosted mode below when other people can
  reach the website.

### 🌐 2. Shared website (multi-user)

- Run `node server.js` (or `npm start`) and the same app becomes a website everyone can open.
- **Admins have their own accounts** (username + password). Anyone else is read-only.
- All admins edit the **same** data; every change is saved on the server and
  **shown live to everyone** (via Server-Sent Events — no page refresh needed).
- A **🕓 Recent changes** feed on the dashboard shows *who changed what and when*.
- In hosted mode the server re-checks the session and role on **every admin action**, so the
  browser-only bypass above does not apply.

---

## 🔐 Accounts and roles

Every install starts with **one protected head admin**:

- Username: **`Tharana is the Goat`**.
- The password is supplied privately with the owner's handover. It is never stored in this repo,
  never written to logs, and never placed in exported league data — only a salted hash is kept.
- The head admin cannot be removed, renamed or demoted, including from the Admins panel.
- The head admin can change their own password in the **Change password** settings panel; the new
  password must be **at least 8 characters**.

Head-only **Admins** panel (`👥 Admins` on the dashboard):

- Add an admin with their own username + password, or **generate a one-time password** to share
  privately (shown once, never written to the activity feed).
- Usernames are unique and case-insensitive; spaces are allowed.
- Remove an admin after a confirmation. Their existing sessions stop working immediately.
- Reset another admin's password. That admin is signed out and must use the new password.
- Regular admins keep every league/news/fan management ability, but cannot open the Admins panel or
  touch other accounts.

Login security:

- The failure message is always **`Wrong username or password`** so it never reveals whether an
  account exists.
- After **5 failed attempts**, that username is locked out for **5 minutes** (per client IP on the
  server; per browser in local mode).
- Sessions live in **sessionStorage**, so closing the browser or pressing **Log out** ends them.
  Hosted signed tokens also expire after 30 days; role and password changes invalidate old tokens.
- Login, result edits, tournament create/delete, admin add/remove/reset and password changes are
  logged with the acting admin's username. Passwords are never logged.

Storage details:

- Local/browser-only mode uses **PBKDF2-SHA256** (210,000 iterations, random salt) and keeps account
  hashes separately from public league state, so they are not included in `/api/state` or backups.
- Hosted mode uses **scrypt** hashes in `users.json` (or Redis) and HMAC-signed sessions.

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
- Group fixtures are **always single-leg**, including when a double round-robin creates a home and
  an away meeting. Two-leg ties belong to the knockout bracket only.

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
- Knockout rounds can be configured as **single-leg or two-leg** ties; group fixtures never use a
  second leg. Aggregate scores, away goals, extra time and optional **penalty shootouts** are
  supported, winners auto-advance, and the Champion gets a trophy banner.

### Admin controls
- Create / rename / delete tournaments; add / rename / delete groups; add / remove / move teams.
- Record, edit, delete match results per group; choose qualify counts + wildcards;
  build, edit and reset the knockout bracket.
- **Export Backup** (download JSON) / **Import Backup** (restore or migrate into the shared site).

### Club newsroom and matchday
- A global header search across **teams (with their next fixture)**, fixtures/results, players, news,
  tournaments and site pages, with keyboard navigation and safe escaped output.
- An admin-editable announcement banner in **info / warning / urgent** styles. Visitors can dismiss
  it; the dismissal resets automatically whenever the message changes.
- Home-feed fixture strip with team filter and a remembered **My team**, local-time kickoffs and
  `.ics` calendar downloads for Google Calendar, Apple Calendar and Outlook.
- Animated honours counters and a champion wall that builds itself from finished tournaments.
- News articles with categories, cover images, hero/latest layouts, category filters, article pages
  and share links.
- A full match-report page for every fixture/result: score, scorers, lineups, MOTM, report body and a
  screenshot gallery, plus a report editor for admins.

### Fan Zone
- **Predictions** lock automatically at kickoff and score **3 points** for an exact score /
  **1 point** for the correct result, with a fan leaderboard.
- **Man of the Match** voting is one vote per device per match; admins can close, reopen and confirm
  the winner.
- **Fantasy Team of the Week** uses a best-XI pitch graphic and one submitted XI per device per round.
- **Polls** on the front page and Fan Zone use one vote per device, animated result bars and
  admin-controlled open/closed state.
- Fan voting needs no account. When hosted, votes are re-checked by the server in `/api/fan`, so the
  one-vote rule cannot be bypassed by editing local storage.

### Players, rankings and spotlight
- Player profiles track XP and levels from wins, draws, goals, clean sheets and appearances, plus an
  admin XP bonus. Automatic and manual badges are supported.
- Admin power rankings with rise/fall arrows and notes.
- An admin-picked **Player of the Month** spotlight on Home.

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
1. **Create storage (two easy choices — no app code changes either way):**
   - **Vercel KV (easiest — no extra signup):** Vercel dashboard → your project → **Storage** tab →
     **Create Database → KV (Redis)** → connect it to your project.
     It auto-adds `KV_REST_API_URL` + `KV_REST_API_TOKEN` to your env vars.
   - **Upstash Redis:** create a free database at upstash.com → open the **REST API** tab →
     copy the **REST URL** and **REST Token**.
2. Push this folder to a GitHub repo. The `api/` folder and `vercel.json` are pre-configured.
3. On Vercel: **Add New → Project → Import** the repo.
   Framework preset: **Other** · no build step, no start command needed.
4. Make sure these **Environment Variables** exist (Project → Settings → Environment Variables):
   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash) **or**
     `KV_REST_API_URL` + `KV_REST_API_TOKEN` (added automatically by Vercel KV)
   - `SECRET` — a random string (keeps admin sessions valid across redeploys)
   - `ADMIN_USER` / `ADMIN_PASSWORD` — **optional** first-run override. Leave them unset to keep the
     built-in head admin. If you set one, set both; they only seed a fresh deployment.
5. **Deploy** → you get `https://your-league.vercel.app`. Share it with everyone.
6. Log in as the head admin and add the other admins from the dashboard (👥 Admins).

> On Vercel the browser polls `/api/state` every ~4 seconds, so another admin's change
> appears almost immediately and the Recent changes feed refreshes on its own.

### Option B — Render.com (free, instant push) 
1. Push this folder to a GitHub repo.
2. On Render: **New → Web Service**, pick the repo.
3. Build command: leave empty · Start command: `node server.js`.
4. Add a strong `SECRET`. Optionally add `ADMIN_USER` + `ADMIN_PASSWORD` if you want a different
   first-run head admin instead of the built-in one.
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
| `ADMIN_USER` | unset | Optional first-run head admin username (fresh deployment only) |
| `ADMIN_PASSWORD` | unset | Optional first-run head admin password; set with `ADMIN_USER` or leave both unset |
| `SECRET` | dev-only | Random string for admin sessions — set it in production |
| `OPEN_BROWSER` | `1` | Set `0` to disable auto-opening a browser on `npm start` |
| `UPSTASH_REDIS_REST_URL` | – | Redis REST URL — Upstash (or use Vercel KV below) |
| `UPSTASH_REDIS_REST_TOKEN` | – | Redis REST token — Upstash |
| `KV_REST_API_URL` | – | Redis REST URL — **Vercel KV** (added automatically when you connect a KV store) |
| `KV_REST_API_TOKEN` | – | Redis REST token — Vercel KV |
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

Runs five suites (zero external dependencies):

| Suite | What it covers |
|-------|----------------|
| `test.js` | App logic: local admin accounts, PBKDF2 login, lockout, head-only actions, groups, single-leg group fixtures (including double round-robin), tables, qualify counts, wildcards, seeding, two-leg knockout, migration, rankings, advice |
| `render-smoke.js` | Rendering: read-only + head-admin views, brackets, animations markup |
| `feature-smoke.js` | Every public route, global search (teams/next fixture/players/news/pages), empty states, XSS escaping, announcement dismissal, fixture filters/calendar, news, match reports, predictions, MOTM, fantasy, polls and admin CRUD/activity messages |
| `api-test.js` | Backend: signed sessions (login/logout/verify), public read, shared saves, change feed, head-only account admin, password/reset invalidation, login lockout, SSE broadcasts, `/api/fan` voting rules, Redis storage adapter (via mock REST) |
| `sync-test.js` | Browser↔server sync: SSE host (instant push) + serverless host (Vercel-style polling), account login, authenticated saves, live updates, activity feed, no-render-when-unchanged |

---

## Tips
- Teams with 0 goals: enter `0` — numbers are fine left as-is.
- You can't record the same exact fixture twice; use **Edit** to change a score.
- Use **Export Backup** before a knockout reset to keep a safety copy.
- On the shared site, **log out** on shared computers; use the 🕓 feed to see what other admins did.