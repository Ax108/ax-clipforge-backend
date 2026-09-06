# Agent instructions — ClipForge backend

Standalone Express API: [https://github.com/Ax108/ax-clipforge-backend](https://github.com/Ax108/ax-clipforge-backend).

The UI is a **separate** GitHub project: [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend). Not a monorepo. Do not cite other workspace remotes in ClipForge docs.

Code is the source of truth (`src/config/env.ts`, `src/services/job.service.ts`, `src/services/ytdlp.service.ts`). Update these docs when that code changes.

## Read this first

| Doc                                  | Use when                                           |
| ------------------------------------ | -------------------------------------------------- |
| [README.md](../README.md)            | Setup, scripts, install                            |
| [LOCAL_API.md](./LOCAL_API.md)       | curl/GET download without the frontend; `KEEP_TMP` |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | HTTP contracts, tmp lifecycle, frontend wiring     |
| [DEPLOYMENT.md](./DEPLOYMENT.md)     | Docker Desktop vs `bun run dev` binaries           |
| [MAINTENANCE.md](./MAINTENANCE.md)   | yt-dlp/ffmpeg updates, cookies, CORS               |

## Do

- Package manager is **Bun**. Clone/CI: `bun install --frozen-lockfile`. Change deps: `bun add`.
- After code changes: `bun run lint`, `bun run tsc`, `bun run tsc:app`, `bun run test`. Then `bun run format:check`.
- Docker: `TMP_DIR=/tmp/clipforge`, `KEEP_TMP=false` (TTL/LRU eviction only). **Never** bind-mount `./tmp`. Completed cache files are **reused**, not deleted after each stream.
- Local `bun run dev`: `KEEP_TMP` defaults **true** (no cache eviction). Files live in `./tmp/cache`.
- Redis: Compose runs Redis for job snapshots + pub/sub (loopback publish). `bun run dev` without `REDIS_URL` uses in-memory jobs (SSE still works). `bun run dev` binds `127.0.0.1` unless `LISTEN_HOST` is set.
- CORS is an allowlist. Never `*`.
- Cite only the two ClipForge GitHub URLs above.

## Do not

- Commit `.env`, `cookies.txt`, or `tmp/`.
- Treat the API as a public open-proxy.
- Change the frontend from this repo. Download is already wired in the frontend `src/services/api.ts` (`POST /jobs` + SSE). Load/title still uses oEmbed.
- Bind-mount host `./tmp` into Compose. That writes media into the git checkout and can fill the host disk.
- Set `KEEP_TMP=true` in the Docker image or Compose.

## Commands (cwd = this repo)

```bash
bun install --frozen-lockfile
bun run allow-scripts
bun run lint
bun run tsc
bun run tsc:app
bun run test
bun verify
bun run docker:up
```

Local URL tests (full + clip): [LOCAL_API.md](./LOCAL_API.md).

## Ready for frontend wiring?

**Wired.** UI `triggerDownload` uses `POST /api/v1/jobs` + `GET /api/v1/jobs/:id/events` (yt-dlp progress) then the browser saves `GET /api/v1/jobs/:id/file` (`Accept-Ranges: bytes`). `GET /api/v1/download` remains for curl. Load/title still uses oEmbed, not `POST /info`.
