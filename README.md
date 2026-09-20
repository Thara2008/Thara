# ⚽ FC Mobile League Manager

A self-contained website for running FC Mobile league tournaments.
No installation, no servers, no internet needed — **just open `index.html` in any browser**
(double-click it, or right-click → Open with → Chrome/Edge/Firefox).

All data is saved automatically in your browser (localStorage), so it survives closing the tab.

---

## 🔐 Admin PIN

- **PIN: `qwert`**
- Click **"🔐 Admin Login"** (top-right) and enter the PIN to unlock **edit mode**.
- Everyone else (viewers) is **read-only** — they can watch tables, results and brackets but can't change anything.
- Click **Lock** when you're done, so the next person only has viewing access.

> Note: this is a lightweight, client-side PIN check (perfect for a club/local league).
> It hides editing from casual viewers; it does not protect against browser-savvy users sharing the code.

---

## 🏟️ Features

### Multiple tournaments at once
- Create unlimited leagues on the dashboard (e.g. "Premier League", "Weekend Cup").
- Each tournament has its own teams, results, table and knockout bracket.

### World Cup–style groups
- Every tournament starts with a **Group A**; the admin can add as many as needed (Group B, Group C, …). Groups are auto-named with the next letter.
- Groups can be **renamed, deleted**, and teams can be **moved** between them.
- Each group has its **own automatic points table** (Win 3, Draw 1, Loss 0), so you can track several pools at once — just like a real World Cup draw.

### Round-robin with automatic points table
- Add teams/players per group, then record match results (pick the group, then two teams from it).
- The points table updates **automatically** in standard football format:

| Stat | Meaning |
|------|---------|
| P | Played |
| W / D / L | Wins / Draws / Losses |
| GF / GA / GD | Goals For / Against / Difference |
| Pts | **Win = 3, Draw = 1, Loss = 0** |

- Ranking order: **Points → Goal Difference → Goals For** (then team name).
- Rows in the **QUALIFY** zone are the teams that go through to the knockouts (green highlight).

### 🏅 Overall Rankings + advice
- The **🏅 Rankings** tab shows **every team, everywhere**: one combined list of your whole tournament with every stat (P, W, D, L, GF, GA, GD, Pts), medals 🥇🥈🥉, group tag, and knockout-qualified/crown markers.
- Right below it, **every team gets personal advice for the next tournament** — built from their real stats (e.g. attack/defence reviews, draw-sickness, missed qualification, or "defending champion – evolve or get dethroned").

### 🎉 Winner animations
- Knockout winners get a golden **shimmer + pulse** with a bouncing trophy 🏆 and a popping **WINNER** stamp, league match winners get a ⭐ highlight, and the champion banner fires **confetti** 🎊.

### Knockouts: you choose the format
- In **🏆 Knockouts** the admin decides:
  - **How many teams qualify from each group** (e.g. top 2, top 3, …),
  - **Best-placed wildcards** to top the field up to a bracket size (like the best third-placed teams),
  - The bracket size is then **2 / 4 / 8 / 16 / 32**.
- The bracket is built automatically with the right number of rounds — e.g. **8 teams → Quarter-Finals → Semi-Finals → Final**; **16 teams → Round of 16 → Quarter-Finals → Semi-Finals → Final**; **4 teams → just Semi-Finals → Final**.
- Qualifier slots are **pre-filled automatically** (group winners first, then runners-up, then wildcards by points) and the admin can change **any** pick before creating the bracket.
- Record knockout scores (with optional **penalty shootout** winner if tied).
- Winners advance automatically into the next round, and the **Champion** is crowned with a trophy banner.
- **Reset / Rebuild Knockouts** clears the bracket so you can redo the draw at any time.

### Admin controls (all behind the PIN)
- Create / rename / delete tournaments
- Add / rename / delete groups, add / remove / move teams between groups
- Record, edit and delete match results (per group)
- Set qualify counts per group, wildcards, pick qualifiers, create and edit the knockout bracket, reset it anytime
- **Export Backup** (download JSON) and **Import Backup** (restore/share on another device)

---

## Tips
- Teams with 0 goals: enter `0` — numbers are fine left as-is.
- You can't record the same exact fixture twice; use **Edit** to change a score instead.
- Use **Export Backup** before a knockout reset to keep a safety copy.
- To clear everything: dashboard → (admin) → **Reset All Data**.