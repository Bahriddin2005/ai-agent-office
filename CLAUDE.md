# AI Agent Office

3D office (Three.js + Vite, vanilla TS) that visualises Claude Code agents, skills and commands gathered from eleven upstream repos, and runs them: task teams (crews) take chat messages, website requests, whole projects (interview → approved plan → app + API + MCP server + bot) and screenshot analyses; finished sites can be marked up and revised into new versions. The Boss (walkable) inspects agents and sends them to Claude Academy, whose classes add learned skills to agents' prompts. A small Express/WebSocket server handles live hook events, agent calls through the Claude CLI and "hiring" into `.claude/`.

## Commands

- `npm run dev` — server (:3334) + Vite (:3333, proxies /api, /ws, /workspaces)
- `npm run build` — `tsc --noEmit` + `vite build` (copies `library/` into `dist/`); `VITE_OFFLINE=1` for static hosting
- `npm start` — build, then serve UI + API on :3334
- `npm run sync` / `npm run build:library [-- --dir <sources>]` — refresh `.sources/` and regenerate `library/` and `public/data/*.json`
- `npm run build:teams` — regenerate `teams.json` and `prompts.json` only; `npm run benchmark [-- --team coder]` — real timed + judged test of team members (spends Claude usage)
- `npm run hire -- <id|name> [--scope user] [--project dir]`, `npm run hooks:install [-- --project dir | --remove]`

## Layout

- `scripts/build-library.mjs` scans sources; `scripts/lib/departments.mjs` classifies items into departments; `scripts/lib/synthetic.mjs` adds the Hermes / Graphify / office-manager agents and README guides; `scripts/lib/teams.mjs` defines the task teams.
- `library/` and `public/data/*.json` are generated — change the scripts, not the output (`benchmarks.json` comes from `npm run benchmark`).
- `sources.json` lists the upstream repos; big ones use `sparse` clones and `scan` rules (regex → type/dept, `nameFrom`, `meta`, README `split` into guides).
- `src/ai/engine.ts` picks where answers come from: the office server (`/api/ai` → Claude CLI), claude.ai's `sample` capability, or none. `src/ai/crews.ts` holds the chat / website / project / content / task pipelines (`waitFor`/`answer` for questions and plan approval, `run.cache` so Retry resumes, `revise`/`restore` for versions, `save`/`load` keep the last runs in localStorage); `src/ai/exam.ts` has the Boss's exam and Claude's lesson notes. `languageRule()` makes agents answer in Uzbek when the UI is Uzbek.
- `src/sim/academy.ts` (classes, progress in localStorage, `knowledge(id)` appended to personas) and `src/sim/boss.ts` (patrol, `inspect`, manual control) drive Claude Academy and the Boss.
- `src/world/layout.ts` (campus plan: `BUILDINGS`, `buildingOf`, desks per building, routing), `campus.ts` (building shells that fade when zoomed in, plaza, gardens, gate), `office.ts` (interiors, books, core), `human.ts` (shared person model: geometry with colour slots, outfits, hair, roles/`lookFor`, `solvePose`), `people.ts` (instanced crowd with a per-person palette texture), `avatar.ts` (same person in high detail for the portrait), `src/sim/*` (actors incl. `roleOf`, cleaners/guard, director), `src/ui/*` (HUD, results view with the preview helper for marks and error reports, portrait, graph view).
- Person geometry is built in metres facing +z (left = +x); keep `solvePose` the single source of joint angles for both the crowd and the portrait.
- `server/index.mjs` binds 127.0.0.1, checks Host/Origin, and requires the token in `~/.ai-agent-office/token` for hooks and POSTs. `server/ai.mjs` runs agent calls from an empty temp folder with no tools (Read only for screenshots) and a thinking budget per tier. Built sites are saved in `workspaces/` and served with a CSP sandbox.

## Debugging

Open the page with `?speed=3&nobloom`; `window.office` exposes `lookAt(x, z, d)`, `view(pos, target)`, `selectItem(id)`, `setGraph(bool)`, `crews`, `results`, `engine()`, `director`, `cast`, `academy`, `boss`. Set `OFFICE_DEBUG_AI=1` to keep the last `/api/ai` request in `$TMPDIR/ai-agent-office-run/last-request.json`.
