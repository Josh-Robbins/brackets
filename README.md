# Brackets (v0.4.1)

**Import brackets; build an SPA.** React‑ish, server‑first framework:
- File‑based routing + decorators
- `.bxc` Single‑File Components (React feel)
- Hooks: `useState`, `useMemo`, `useQuery` (server‑side, session‑backed)- HTML‑over‑the‑wire with HTMX 2.x, OOB swaps, and optional morph diff
- One‑liner CRUD: `crud('/todos', model=Todo)`
- Caching: `@cache(seconds, key=..., tags=[...], vary=[...], stale=...)` + zero‑config Redis
- Plugin API & SSE “Live Bits”
- Desktop via PyWebView + packaging via PyInstaller
- **No underscores in author code**

See `docs/` for full usage. Try `examples/todos`.

