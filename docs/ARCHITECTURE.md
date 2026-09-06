# Architecture

ClipForge backend is a standalone Express API: [https://github.com/Ax108/ax-clipforge-backend](https://github.com/Ax108/ax-clipforge-backend).

The UI is a separate GitHub project: [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend). They are not a monorepo.

**This API is an initial scaffold.** `/info` and `/download` return `501 not_implemented`. The frontend still uses its **mock** client in `src/services/api.ts`. Wiring those together is a later plan.

## Current run mode

| Surface  | Now                                                         | Later (not this scaffold)               |
| -------- | ----------------------------------------------------------- | --------------------------------------- |
| Frontend | Local Vite `http://localhost:5173`                          | Maybe Vercel / Netlify / Render         |
| Backend  | Local `bun run dev` and/or **local Docker** on this machine | Maybe a hosted image (public HTTPS API) |

Docker is **local-only today**. Cloud image hosting is documented as a future option in [DEPLOYMENT.md](./DEPLOYMENT.md). A hosted frontend **cannot** call `localhost` on your PC.

## Stack

| Layer                          | Choice                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| HTTP                           | Express 5 + TypeScript 7                                                                |
| Runtime / install              | Bun for install and `bun run dev`. Express is the HTTP framework (Node-compatible). The Docker image also includes Node.js for yt-dlp n-sig. |
| Validation                     | Zod (`src/config/env.ts`)                                                               |
| Extract (later)                | yt-dlp via `execa` when download is implemented; health probes use `node:child_process` |
| Mux / trim / transcode (later) | `mediabunny` + `@mediabunny/server`                                                     |
| Database                       | None this phase (no MongoDB)                                                            |

`@mediabunny/server` is a TypeScript API over **NodeAV → FFmpeg C libraries**. It is not FFmpeg-free. The Docker image still ships FFmpeg. yt-dlp may still call an `ffmpeg` binary to merge DASH video+audio until MediaBunny muxing is implemented.

Docker also installs **Node.js** so yt-dlp can solve YouTube n-sig / EJS challenges, and **Python 3**.

## Request flow (today vs later)

```text
Now:
  Browser (Vite :5173)
    → frontend mock api.ts  (oEmbed + fake progress)
    → optional: GET localhost:5000/api/v1/health (this API, stubs only)

Later (not this plan):
  Browser
    → POST /api/v1/info     → YtDlpService
    → GET/POST /api/v1/download → yt-dlp → MediaBunny → stream file to the device
```

No job store. When download is implemented, the file streams to the client device. Concurrency will be an in-process semaphore, not Redis/BullMQ, until that requirement changes.

## HTTP contracts

Prefix: `/api/v1`. CORS is an **allowlist** (`CORS_ORIGINS`, comma-separated). Production must not use `*`.

| Method    | Path               | Now                                                                                              | Intended later                                                         |
| --------- | ------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| GET       | `/api/v1/health`   | 200: API up; `yt-dlp` / `ffmpeg` / MediaBunny presence (false is OK on Windows without binaries) | Same, plus versions                                                    |
| POST      | `/api/v1/info`     | 501 `{ status: "not_implemented" }`                                                              | Metadata (title, duration, formats) without downloading                |
| GET, POST | `/api/v1/download` | 501                                                                                              | Stream extract; query/body: `url`, `start`, `end`, `format`, `quality` |

These match what [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend) already builds in `buildDownloadUrl` (`VITE_API_URL` default `http://localhost:5000/api/v1`).

## Layout

```text
src/
├── server.ts                 # listen
├── app.ts                    # Express app + CORS
├── config/env.ts
├── controllers/download.controller.ts
├── routes/health.routes.ts
├── routes/download.routes.ts
├── services/ytdlp.service.ts # args + binary probe only
└── services/media.service.ts # MediaBunny / ffmpeg probe only
```

`YtDlpService.extraArgs()` already reads `PROXY_URL`, `COOKIE_FILE_PATH`, and `PO_TOKEN`. It does not spawn a download yet.

## Quality tooling

Same pattern as [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend): oxlint (no React rules here), oxfmt, Jest (node), Fallow, LavaMoat `allow-scripts`, Bun `exact` + `minimumReleaseAge` (3 days), Husky pre-push `bun verify`.
