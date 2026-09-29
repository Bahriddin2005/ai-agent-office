# AI Agent Office

3D office (Three.js + Vite, vanilla TS) that visualises Claude Code agents, skills and commands gathered from six upstream repos, plus a small Express/WebSocket server for live hook events, task dispatch (`claude -p`) and "hiring" into `.claude/`.

## Commands

- `npm run dev` — server (:3334) + Vite (:3333, proxies /api and /ws)
- `npm run build` — `tsc --noEmit` + `vite build` (copies `library/` into `dist/`)
- `npm start` — build, then serve UI + API on :3334
- `npm run sync` / `npm run build:library [-- --dir <sources>]` — refresh `.sources/` and regenerate `library/`, `public/data/registry.json`, `public/data/graph.json`
- `npm run hire -- <id|name> [--scope user] [--project dir]`, `npm run hooks:install [-- --project dir | --remove]`

## Layout

- `scripts/build-library.mjs` scans sources; `scripts/lib/departments.mjs` classifies items into departments; `scripts/lib/synthetic.mjs` adds the Hermes / Graphify / office-manager agents and README guides.
- `library/` and `public/data/*.json` are generated — change the scripts, not the output.
- `src/world/layout.ts` (floor plan + routing), `office.ts` (static scene, books, core), `people.ts` (instanced characters), `src/sim/*` (actors + director), `src/ui/*` (HUD, graph view).
- `server/index.mjs` binds 127.0.0.1, checks Host/Origin, and requires the token in `~/.ai-agent-office/token` for hooks and POSTs.

## Debugging

Open the page with `?speed=3&nobloom`; `window.office` exposes `lookAt(x, z, d)`, `selectItem(id)`, `setGraph(bool)`, `director`, `cast`.
