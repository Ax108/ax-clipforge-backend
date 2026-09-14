# Maintenance

Long-term operation of a YouTube extract API. This is **not** a bypass cookbook. YouTube, Facebook, and Safe Browsing can still flag a public extract product; we cannot guarantee otherwise.

## Agent notes

- Prefer **latest yt-dlp** always. Docker: GitHub `latest` at image build + `yt-dlp -U` in `docker/entrypoint.sh`. Local: `yt-dlp -U` on the host.
- Prefer a **current FFmpeg**. Docker uses the distro package in the image; rebuild the image to refresh it. Local: upgrade the host binary (winget/brew/apt), do not leave old copies on PATH.
- Crawler block on `/download`, `/audio`, `POST /jobs`, `POST /audio/jobs`, and `GET /jobs/:id/file` is implemented (`src/lib/crawler.ts`).
- `GET /robots.txt` is `Disallow: /`; every response also sets `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` (search engines only — does not stop yt-dlp abuse).
- IP rate limits (`express-rate-limit`): hard on extract starters (`/jobs`, `/audio/jobs`, `/download`, `/audio`, `/info`), medium on `/jobs/:id/file`, light on job snapshot/SSE. `/health` and `/robots.txt` are exempt. See `RATE_LIMIT_*` in `.env.example`. Set `TRUST_PROXY=true` behind a reverse proxy.
- Never commit `cookies.txt`. Never bind-mount `./tmp`. Never set `KEEP_TMP=true` in Docker.
- Pin notes in commits when you last verified a yt-dlp version; still install latest when extracting breaks.

## Current vs later

- **Now:** develop on localhost. Rebuild a **local** Docker image when you change this repo.
- **Later (if you host):** still change code in git, `docker build` a **new tag**, then deploy that tag. Do not treat a running container as the source of truth.

Entrypoint `yt-dlp -U` refreshes the extractor on boot. That is a convenience, not a substitute for versioned images.

## When extractors break

YouTube player/signature changes break yt-dlp regularly.

1. Reproduce with `yt-dlp --verbose <url>` on a machine that has the **latest** binary (or inside the local image).
2. Update yt-dlp to **latest** and any wrapper flags in `src/services/ytdlp.service.ts`.
3. Confirm FFmpeg is a **current** build (`ffmpeg -version`).
4. Commit in [https://github.com/Ax108/ax-clipforge-backend](https://github.com/Ax108/ax-clipforge-backend).
5. `bun run docker:up` (rebuilds the local image) or publish a new image tag (future).
6. Confirm `GET /api/v1/health` still reports `binaries.ytdlp` and `binaries.ffmpeg`.

Chasing `latest` on a **public datacenter IP** is a common way to get throttled. Localhost / Docker on a home machine is the current target.

## Tmp hygiene (disk)

| Control                               | When                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Reuse `tmp/cache/{cacheKey}.{format}` | Always, on cache hit. Exact requested extension only.                                                                         |
| Keep `.part` for `--continue`         | Failed/interrupted yt-dlp                                                                                                     |
| Evict cache by TTL/size               | `KEEP_TMP=false` (Docker)                                                                                                     |
| No eviction                           | `KEEP_TMP=true` (`bun run dev`)                                                                                               |
| Redis job JSON TTL                    | `JOB_TTL_MS` when `REDIS_URL` is set. Redis expiry is the source of truth; the process does not keep a second unexpired copy. |

Do not bind-mount `./tmp`. Delete host `tmp/` yourself if the disk fills on `bun run dev`.

## Anti-bot env (already stubbed)

| Variable           | Role                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| `PROXY_URL`        | Optional HTTP(S) proxy (residential if you ever leave localhost).                  |
| `COOKIE_FILE_PATH` | Netscape `cookies.txt` for age-gated / logged-in playback. Never commit this file. |
| `PO_TOKEN`         | Optional YouTube proof-of-origin extractor arg.                                    |

Use these only as yt-dlp documents them. Do not add user-agent cloaking, Facebook-specific spoofing, or hidden download endpoints.

## Rate and IP

- Localhost: your residential IP; still avoid burst downloads while testing.
- Cloud VM IPs are often flagged faster than home ISPs. If you host the image later, concurrency locks belong in the app (semaphore), not “open proxy for the internet”.
- `GET /api/v1/health` is the cheap liveness check. Do not use `/download` or `/audio` as a health probe.

## Public site reputation

If the UI at [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend) is ever public (Vercel / Netlify / Render):

- Allowlisted CORS only.
- HTTPS on UI and API.
- No fake YouTube/Facebook branding or cloaking.
- Do not start yt-dlp jobs for link-preview crawlers (`facebookexternalhit`, etc.) — already `403` on `/download`, `/audio`, `POST /jobs`, `POST /audio/jobs`, and `GET /jobs/:id/file`.
- Serve `GET /robots.txt` (`Disallow: /`) and `X-Robots-Tag` on API responses so search engines should not index the API host.
- Keep IP rate limits on (defaults in `.env.example`). Raise `RATE_LIMIT_*` only if legitimate clients hit 429. Use `TRUST_PROXY=true` only when a reverse proxy sets `X-Forwarded-For`.
- The API must not be an anonymous download open-proxy.

## Health

`GET /api/v1/health` reports `binaries` (`ytdlp`, `ffmpeg`), `ytdlpVersion`, `extractorFlags`, and `tmp` (`dir`, `keepTmp`, `maxAgeMs`). On `bun run dev`, `"ytdlp": false` usually means the binary is installed but **not visible to that process** (stale shell PATH, or need `YTDLP_BIN=/absolute/path/to/yt-dlp`). Fix PATH or `YTDLP_BIN`, restart `bun run dev`, re-check health. The local Docker image ships yt-dlp + FFmpeg so host PATH is irrelevant there.

## Supply chain

- Prefer `bun install --frozen-lockfile` (matches `bun.lock` and CI). Use `bun add` when changing packages.
- Bun `minimumReleaseAge = 259200` (3 days).
- `ignoreScripts = true`; only LavaMoat-allowlisted install scripts run.
- `bun run check-install-scripts` fails CI if a new top-level install script appears.
- `bun run lint` is `oxlint .` (see `package.json`).
