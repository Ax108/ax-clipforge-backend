# Architecture

ClipForge backend is a standalone Express API: [https://github.com/Ax108/ax-clipforge-backend](https://github.com/Ax108/ax-clipforge-backend).

The UI is a separate GitHub project: [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend). They are not a monorepo.

**Status:** `/info`, `/download`, and `/jobs` (SSE progress + cached files + HTTP Range) are implemented. The UI `triggerDownload` is wired to `/jobs`. Load/title still uses oEmbed, not `POST /info`.

No MongoDB. Clips use yt-dlp `--download-sections` + `--force-keyframes-at-cuts` (FFmpeg CLI for merge/cut). MediaBunny remains installed for later TypeScript remux, not this path.

## Agent notes

- Docker writes to `/tmp/clipforge/cache` inside the container (`KEEP_TMP=false` = TTL/LRU eviction only). Completed files are **reused** for the same cache key. Compose publishes `127.0.0.1:5000` and `127.0.0.1:6379` only.
- Local `bun run dev`: `KEEP_TMP` defaults **true**. Cache stays in gitignored `./tmp/cache`. `LISTEN_HOST` defaults to `127.0.0.1`.
- Progress is real yt-dlp lines via SSE (`POST /api/v1/jobs`, `GET /api/v1/jobs/:id/events`). Dropping SSE does **not** kill yt-dlp. File GET supports `Range`.
- Redis (Compose) stores job snapshots with `JOB_TTL_MS`. Expired Redis keys are gone (no unbounded in-process copy). Without `REDIS_URL`, jobs are in-memory.
- The browser saves the file from the HTTP stream. The API never writes into the user’s Downloads folder or the frontend repo.
- Folder pickers (`showSaveFilePicker`) are a **frontend** choice, not an API header.

## Current run mode

| Surface  | Now                                                         | Later (not this scaffold)       |
| -------- | ----------------------------------------------------------- | ------------------------------- |
| Frontend | Local Vite `:5173` (jobs SSE for Download; oEmbed for Load) | Maybe Vercel / Netlify / Render |
| Backend  | Local `bun run dev` and/or **local Docker** + Redis sidecar | Maybe a hosted image            |

Docker is **local-only today**. Cloud image hosting is a future option in [DEPLOYMENT.md](./DEPLOYMENT.md). A hosted frontend **cannot** call `localhost` on your PC.

## Stack

| Layer                   | Choice                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP                    | Express 5 + TypeScript 7                                                                                                                      |
| Runtime / install       | Bun for install and `bun run dev`. Express is the HTTP framework. The Docker image also includes Node.js for yt-dlp n-sig.                    |
| Validation              | Zod (`src/config/env.ts`, `src/config/request.ts`)                                                                                            |
| Extract                 | yt-dlp (`child_process` spawn), in-process semaphore (`DOWNLOAD_CONCURRENCY`)                                                                 |
| Clip cut                | `--download-sections "*START-END"` + `--force-keyframes-at-cuts`                                                                              |
| Tmp                     | `tmp/cache/{id}_{format}_{quality}_{full\|start-end}.{format}`. Only that exact file is a cache hit. Docker TTL/LRU. Redis optional for jobs. |
| Mux / transcode (later) | `mediabunny` + `@mediabunny/server` (not used on the download path yet)                                                                       |
| Job store               | Redis when `REDIS_URL` is set (Compose); otherwise in-memory                                                                                  |

`@mediabunny/server` is a TypeScript API over **NodeAV → FFmpeg C libraries**. It is not FFmpeg-free. The Docker image still ships FFmpeg. yt-dlp may still call an `ffmpeg` binary to merge DASH video+audio until MediaBunny muxing is implemented.

Docker also installs **Node.js** so yt-dlp can solve YouTube n-sig / EJS challenges, and **Python 3**.

## Frontend wiring

The in-app Download button calls `POST /api/v1/jobs`, listens to SSE `GET /api/v1/jobs/:id/events` (stages `queued` / `downloading` / `merging` from yt-dlp), then the browser downloads `GET /api/v1/jobs/:id/file`.

1. Same **cache key** (video id + format + quality + `full` or `start-end`) returns the cached file. No second YouTube pull, no second ffmpeg merge.
2. `Content-Disposition: attachment` + `Accept-Ranges: bytes`. Interrupted file transfers resume with `Range` (browser download shelf or `curl -C -`).
3. Interrupted **extract**: yt-dlp `--continue` keeps `.part` files; reconnect SSE or `GET /jobs/:id`. Closing the EventSource does not abort the job.
4. Docker does **not** delete the cache after the stream. `KEEP_TMP=false` only evicts old/large cache.

Folder pickers (`showSaveFilePicker`) remain an optional Chromium UI later. Direct GET `/download?...` still works for curl (waits until the job finishes, then streams; uses cache).

## Tmp and disk

| Mode                | `KEEP_TMP`       | Where files land                 | After download                                                      |
| ------------------- | ---------------- | -------------------------------- | ------------------------------------------------------------------- |
| `bun run docker:up` | `false`          | Container `/tmp/clipforge/cache` | **Kept and reused.** Evicted by `CACHE_TTL_MS` / `CACHE_MAX_BYTES`. |
| `bun run dev`       | `true` (default) | `{cwd}/tmp/cache`                | **Kept.** No TTL eviction.                                          |

Incomplete `.part` files stay so yt-dlp `--continue` can resume. Stale parts are swept after `TMP_MAX_AGE_MS` when `KEEP_TMP=false`. Do not volume-mount `./tmp`. One concurrent extract (`DOWNLOAD_CONCURRENCY=1`).

## Request flow

```text
Browser or curl
  → GET /api/v1/health   (binaries, tmp, jobs.store memory|redis)
  → POST /api/v1/info    → yt-dlp --dump-single-json
  → POST /api/v1/jobs    → cache hit? stream later : queue yt-dlp
       → GET /api/v1/jobs/:id/events  (SSE: downloading % / merging)
       → GET /api/v1/jobs/:id/file    (attachment, Accept-Ranges)
  → GET /api/v1/download?...   (curl: wait + stream; same cache)
```

## HTTP contracts

Prefix: `/api/v1`. CORS is an **allowlist** (`CORS_ORIGINS`, comma-separated). Production must not use `*`.

| Method    | Path                      | Behavior                                            |
| --------- | ------------------------- | --------------------------------------------------- |
| GET       | `/api/v1/health`          | binaries, `tmp`, `jobs.store` (`memory` \| `redis`) |
| POST      | `/api/v1/info`            | `{ url }` → metadata JSON, or 400/503               |
| POST      | `/api/v1/jobs`            | start extract; 200 cache hit / 202 queued           |
| GET       | `/api/v1/jobs/:id`        | snapshot                                            |
| GET       | `/api/v1/jobs/:id/events` | SSE `progress` (reconnect-safe)                     |
| GET       | `/api/v1/jobs/:id/file`   | attachment; `Range` → 206; 409 if not ready         |
| GET, POST | `/api/v1/download`        | wait + stream (curl); same cache; 403 crawlers      |

Download body/query: `url` (required), `format` (`mp4` \| `mp3` \| `m4a` \| `flac`, default `mp4`), `quality` (mp4 height like `1080p`; audio `best` / `128kbps` / `256kbps` / `320kbps`). Audio kbps labels pass yt-dlp `--audio-quality 128K|256K|320K`. `best` is VBR quality `0` and is a different cache key from `320kbps`. Optional `start`/`end` (seconds or `HH:MM:SS`): both required to clip; omit both for full. Invalid ranges, unknown bitrates, and `720p!`-style quality return 400. Clip seconds are floored so the cache key matches yt-dlp.

These match [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend) `buildDownloadUrl`.

## Layout

```text
src/
├── server.ts                 # listen, cache dir, optional Redis, eviction if KEEP_TMP=false
├── app.ts
├── services/job.service.ts   # cache hit, queue, SSE publish
├── services/ytdlp.service.ts # --continue, --progress, cache output path
├── store/                    # memory + Redis job records
└── lib/cache-key.ts          # stable full vs clip key
```

`YtDlpService.extraArgs()` reads `PROXY_URL`, `COOKIE_FILE_PATH`, and `PO_TOKEN`.

## Quality tooling

Same pattern as [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend): oxlint (no React rules here), oxfmt, Jest (node), Fallow, LavaMoat `allow-scripts`, Bun `exact` + `minimumReleaseAge` (3 days), Husky pre-push `bun verify`.
