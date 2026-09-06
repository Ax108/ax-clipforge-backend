# ClipForge backend

Express + TypeScript API for YouTube extract (yt-dlp). **Health, info, jobs (live progress), cache, Range resume, download, and audio-only extract are implemented.** The UI at [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend) uses `POST /api/v1/jobs` (video) or `POST /api/v1/audio/jobs` (audio) + SSE for in-app progress. `GET /api/v1/download` and `GET /api/v1/audio` are the copyable/curl paths.

![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1+-000000?style=for-the-badge&logo=bun&logoColor=white)

## Agent map

Read [docs/AGENTS.md](./docs/AGENTS.md) first, then:

- [Local API testing](./docs/LOCAL_API.md) — curl full + clipped downloads and audio; `KEEP_TMP`
- [Architecture](./docs/ARCHITECTURE.md) — HTTP contracts, tmp lifecycle, how the browser saves files
- [Deployment](./docs/DEPLOYMENT.md) — Docker Desktop vs local Bun + yt-dlp + FFmpeg
- [Maintenance](./docs/MAINTENANCE.md) — keep yt-dlp/FFmpeg current; cookies/proxy

## Now vs later

- **Now:** this API on `127.0.0.1:5000` (`LISTEN_HOST` defaults to loopback). Extract works via `bun run docker:up` (Docker Desktop + Redis sidecar, host ports on loopback) or `bun run dev` (Bun + **latest yt-dlp** + **latest FFmpeg** on PATH; Redis optional).
- **Not now:** Vercel/Netlify/Render or a public image.

## Tmp: Docker vs local

| Run                 | Extracts                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run docker:up` | Stored in container `/tmp/clipforge/cache`, **reused** for the same video+format+quality+range. `KEEP_TMP=false` only **evicts** by TTL/size. Host git repo is not written. |
| `bun run dev`       | **Kept** in gitignored `./tmp/cache` (`KEEP_TMP=true` by default). Same key = no second YouTube pull.                                                                       |

## What the end user needs

| How they run the API                 | Install on the machine                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recommended:** `bun run docker:up` | [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) or Docker Engine (Linux). **Not** Bun, Node, yt-dlp, FFmpeg, or Python on the host. |
| Local process: `bun run dev`         | [Bun](https://bun.sh) ≥ 1.0, Node.js ≥ 24, **yt-dlp (latest)**, **FFmpeg (latest stable)**.                                                                           |
| Browser only                         | Nothing. The file is saved by the browser after `/download` or `/audio` streams `Content-Disposition: attachment`.                                                    |

Always use the **latest** yt-dlp release (`yt-dlp -U` or the GitHub `latest` binary). Use a **current** FFmpeg build (not a years-old distro pin if you can avoid it). YouTube extractors break often; stale binaries fail first.

## Setup

```bash
bun install --frozen-lockfile
bun run allow-scripts
bun run dev
```

Prefer `--frozen-lockfile` so install matches `bun.lock` (same as CI). Use plain `bun install` or `bun add` only when you intend to change dependencies.

`bunfig.toml` sets `ignoreScripts = true` and a 3-day `minimumReleaseAge`. Follow install with `bun run allow-scripts` so any LavaMoat-allowlisted native install scripts run.

Health: `http://localhost:5000/api/v1/health`

Optional env: copy [`.env.example`](./.env.example). Defaults assume local Vite `http://localhost:5173`.

Docker (no host yt-dlp/FFmpeg):

```bash
bun run docker:up
```

## Scripts

| Command                 | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `bun run dev`           | Watch the API on port 5000                   |
| `bun start`             | Run without watch                            |
| `bun verify`            | Lint, format check, typecheck, tests, Fallow |
| `bun run lint`          | oxlint                                       |
| `bun run format`        | oxfmt                                        |
| `bun run test`          | Jest                                         |
| `bun run allow-scripts` | LavaMoat-allowlisted install scripts         |
| `bun run docker:up`     | `docker compose up --build` (local image)    |

Husky **pre-push** runs `bun verify`. CI on `main` / `develop` runs verify plus an audit job that **fails only on high or critical** advisories (`bun audit --audit-level=high`). Low/moderate findings are reported, not blocking.

## License

Proprietary. Internal use only. Not for sale or distribution.

See [LICENSE](./LICENSE).
