# Deployment

## Agent notes

- End users of the **image** need Docker only (Docker Desktop or Docker Engine).
- `bun run dev` needs Bun **and** latest yt-dlp + latest FFmpeg visible to that process (on PATH, or `YTDLP_BIN` = full path). WinGet installs often require a new shell or an explicit path — see [Localhost process](#2-localhost-process-daily-typescript-development).
- Docker image includes yt-dlp + FFmpeg; host PATH is irrelevant for `bun run docker:up`.
- Never bind-mount `./tmp`. Image: `TMP_DIR=/tmp/clipforge`, `KEEP_TMP=false` (evict, do not wipe after each stream), Redis sidecar.
- IP rate limits and `/robots.txt` apply in Docker the same as `bun run dev` (in-memory per process). Set `TRUST_PROXY=true` only if a reverse proxy forwards client IPs.
- This release is **local**. A hosted UI cannot call `localhost:5000`.
- After changing this repo, rebuild the image (`bun run docker:up`). Do not mutate a running container as a release.

## Now (local release)

Two local ways to run the API. **Neither is a public host.**

### 1. Local Docker image (recommended for “it just works”)

**Requires:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows or macOS, or Docker Engine + Compose on Linux. Start Docker before `docker compose`.

**Does not require on the host:** Bun, Node, Python, yt-dlp, or FFmpeg. Those are inside the image. The image pulls **yt-dlp `latest`** at build time and runs `yt-dlp -U` on container boot. Jest / `src/tests` are **not** copied into the image (see `.dockerignore`); the entrypoint only runs `bun src/server.ts`.

```bash
bun run docker:up
```

That runs `docker compose up --build`. Image tag: `ax-clipforge-backend:local`. Compose publishes **loopback only** (`127.0.0.1:5000` and `127.0.0.1:6379`) so LAN peers cannot reach the unauthenticated API or Redis. The process inside the container still listens on `0.0.0.0` (`LISTEN_HOST`). Compose is for **this development machine only**.

Tmp: `TMP_DIR=/tmp/clipforge` inside the container (files in `cache/`). Compose includes **Redis** and waits until it is healthy before starting the API. `KEEP_TMP=false` evicts by TTL/size; completed extracts are **reused**. Do not mount host `./tmp`.

Update loop today: edit this git repo → `bun run docker:up` → run again.

### 2. Localhost process (daily TypeScript development)

**Requires on the host:**

| Tool                        | Why                                                   | Version policy                                                                                                                   |
| --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [Bun](https://bun.sh) ≥ 1.0 | Install + `bun run dev`                               | Current Bun 1.x                                                                                                                  |
| Node.js ≥ 24                | `engines` field / yt-dlp n-sig if invoked on the host | Current Node 24+                                                                                                                 |
| **yt-dlp** on PATH          | `/info`, `/download`, `/audio`, `/jobs`               | **Always latest** (`yt-dlp -U`, or reinstall from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases/latest))           |
| **FFmpeg** on PATH          | Merge/cut (`--force-keyframes-at-cuts`, DASH mux)     | **Latest stable** (Windows: a current Gyan/winget FFmpeg; macOS: current `brew` ffmpeg; Linux: current distro or a static build) |

Without yt-dlp, `bun run dev` still starts; `/info`, `/download`, `/audio`, and `/jobs` return **503** (`yt-dlp is not installed` / `unavailable`) when they need to start an extract. Missing FFmpeg is reported by health and causes yt-dlp operations that require merge, trim, or audio conversion to fail instead of producing a valid file. Cached files can still be served without starting either binary. Prefer Docker if you do not want to maintain those binaries.

#### yt-dlp / FFmpeg must be visible to the `bun` process

Installing yt-dlp (or FFmpeg) is not enough if the shell that runs `bun run dev` cannot resolve the binary.

- Default: the API spawns `yt-dlp` from **PATH** (`YTDLP_BIN=yt-dlp` in `.env.example`).
- On **Windows** especially, WinGet/installer packages often land in a User PATH entry that **Git Bash, Cursor terminals, or an already-open shell never picked up**. Health then shows `"ytdlp": false` and extracts return **503** even though `yt-dlp.exe` exists on disk.
- **Fix (pick one):** open a **new** terminal after installing so PATH refreshes; prepend the folder that contains `yt-dlp` / `yt-dlp.exe` to `PATH` for that session; or set `YTDLP_BIN` in `.env` to the **full absolute path** of the binary. Same idea for FFmpeg if `binaries.ffmpeg` is false.
- Confirm before coding: `yt-dlp --version`, `ffmpeg -version`, then `curl -s http://localhost:5000/api/v1/health` → both `binaries.ytdlp` and `binaries.ffmpeg` should be `true`.

**Docker does not have this problem.** `bun run docker:up` installs yt-dlp and FFmpeg **inside the image**; the host PATH and `YTDLP_BIN` do not matter.

```bash
cp .env.example .env   # optional; defaults work
bun install --frozen-lockfile
bun run allow-scripts
# Ensure yt-dlp + ffmpeg are on PATH (or set YTDLP_BIN), then:
bun run dev
```

API: `http://127.0.0.1:5000` (`LISTEN_HOST` defaults to loopback)

Health: `http://127.0.0.1:5000/api/v1/health`

Default `TMP_DIR` is `{cwd}/tmp` (gitignored). Cache files live in `{TMP_DIR}/cache`. Default `KEEP_TMP=true`. Same clip parameters reuse the file. Optional `REDIS_URL=redis://127.0.0.1:6379` if Compose Redis is up.

The UI at [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend) on `:5173` uses `POST /api/v1/jobs` (MP4) or `POST /api/v1/audio/jobs` (audio) + SSE for progress. Curl uses `GET /api/v1/download?...` (video) or `GET /api/v1/audio?...` (audio-only). Recipes: [LOCAL_API.md](./LOCAL_API.md).

## Env mapping

| Backend                            | Role                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `LISTEN_HOST`                      | Bind address. Local default `127.0.0.1`. Docker `0.0.0.0` with host publish on loopback.           |
| `PUBLIC_API_URL`                   | Public origin of this API                                                                          |
| `CORS_ORIGINS`                     | Exact browser origins allowed (comma-separated)                                                    |
| `YTDLP_BIN`                        | yt-dlp executable name or **absolute path**. Default `yt-dlp` (must be on PATH for `bun run dev`). |
| `TRUST_PROXY`                      | `true` when a reverse proxy sets `X-Forwarded-For` (rate-limit IP). Local default `false`.         |
| `RATE_LIMIT_ENABLED`               | IP rate limits on. Auto-off when `NODE_ENV=test`.                                                  |
| `RATE_LIMIT_WINDOW_MS`             | Window length (default 15 minutes).                                                                |
| `RATE_LIMIT_EXTRACT_MAX`           | Max extract starts per IP per window (`/jobs`, `/audio*`, `/download`, `/info`).                   |
| `RATE_LIMIT_FILE_MAX`              | Max `GET /jobs/:id/file` per IP per window.                                                        |
| `RATE_LIMIT_JOB_READ_MAX`          | Max job snapshot + SSE opens per IP per window.                                                    |
| `TMP_DIR`                          | Server cache root. Local `{cwd}/tmp`. Docker `/tmp/clipforge`. Files in `cache/`.                  |
| `KEEP_TMP`                         | Local `true` (no eviction). Docker `false` (TTL/size eviction).                                    |
| `REDIS_URL`                        | Compose `redis://redis:6379`. Empty = in-memory jobs.                                              |
| `CACHE_TTL_MS` / `CACHE_MAX_BYTES` | Docker cache eviction                                                                              |

`.env.example` includes placeholder Vercel / Netlify / Render origins. They are **stubs**. Do not treat them as live hosts.

Never set CORS to `*` for a real deployment.

## What operators / end users install

| How they run it                  | On the machine                                       |
| -------------------------------- | ---------------------------------------------------- |
| `bun run docker:up`              | Docker Desktop or Docker Engine only                 |
| `bun run dev`                    | Bun + **latest yt-dlp** + **latest FFmpeg**          |
| Person using the UI in a browser | Browser only; save dialog / Downloads is the browser |

## Future (stubs only — not configured)

### Hosted frontend (Vercel / Netlify / Render)

Possible later. **A hosted UI cannot reach Docker on your PC.** The browser would call a **public HTTPS** API. You would:

1. Set frontend `VITE_API_URL` to that public origin + `/api/v1`.
2. Add the frontend origin to `CORS_ORIGINS`.
3. Host the backend image (or reverse-proxy it), not only local Compose.

### Hosted Docker image

Possible later (Fly, Railway, Render, a VPS, GHCR). Compose comments show a placeholder `image: ghcr.io/ax108/ax-clipforge-backend:TAG`. **Do not enable that now.** Release process if you do: git change → new image tag → deploy that tag. `yt-dlp -U` on boot is extra, not the release.

Keep **`KEEP_TMP=false`** and **no host volume** for tmp in cloud: use the container ephemeral disk. Completed extracts stay until `CACHE_TTL_MS` / `CACHE_MAX_BYTES` eviction. They are not deleted after each stream.

## Out of scope here

- Keep UI Load on oEmbed; do not route paste/preview through `POST /info` (Download-only uses yt-dlp)
- Creating a Vercel/Netlify/Render project
- Pushing images to a registry
