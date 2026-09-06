# Maintenance

Long-term operation of a YouTube extract API. This is **not** a bypass cookbook. YouTube, Facebook, and Safe Browsing can still flag a public extract product; we cannot guarantee otherwise.

## Current vs later

- **Now:** develop on localhost. Rebuild a **local** Docker image when you change this repo.
- **Later (if you host):** still change code in git, `docker build` a **new tag**, then deploy that tag. Do not treat a running container as the source of truth.

Entrypoint `yt-dlp -U` refreshes the extractor on boot. That is a convenience, not a substitute for versioned images.

## When extractors break

YouTube player/signature changes break yt-dlp regularly.

1. Reproduce with `yt-dlp --verbose <url>` on a machine that has the binary (or inside the local image).
2. Update yt-dlp (upstream release) and any wrapper flags in `src/services/ytdlp.service.ts`.
3. Commit in [https://github.com/Ax108/ax-clipforge-backend](https://github.com/Ax108/ax-clipforge-backend).
4. `bun run docker:up` (rebuilds the local image) or publish a new image tag (future).
5. Confirm `GET /api/v1/health` still reports `binaries.ytdlp`.

Pin or note the yt-dlp version you last verified. Chasing `latest` on a public datacenter IP is a common way to get throttled.

## Anti-bot env (already stubbed)

| Variable           | Role                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| `PROXY_URL`        | Optional HTTP(S) proxy (residential if you ever leave localhost).                  |
| `COOKIE_FILE_PATH` | Netscape `cookies.txt` for age-gated / logged-in playback. Never commit this file. |
| `PO_TOKEN`         | Optional YouTube proof-of-origin extractor arg.                                    |

Use these only as yt-dlp documents them. Do not add user-agent cloaking, Facebook-specific spoofing, or hidden download endpoints.

## Rate and IP

- Localhost: your residential IP; still avoid burst downloads while testing later.
- Cloud VM IPs are often flagged faster than home ISPs. If you host the image later, concurrency locks belong in the app (semaphore), not “open proxy for the internet”.
- `GET /api/v1/health` is the cheap liveness check. Do not use `/download` as a health probe.

## Public site reputation

If the UI at [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend) is ever public (Vercel / Netlify / Render):

- Allowlisted CORS only.
- HTTPS on UI and API.
- No fake YouTube/Facebook branding or cloaking.
- Later: do not start yt-dlp jobs for link-preview crawlers (`facebookexternalhit`, etc.). Not implemented yet.
- The API must not be an anonymous download open-proxy.

## Health

`GET /api/v1/health` reports whether `yt-dlp`, `ffmpeg`, and MediaBunny packages are present. Missing binaries on a Windows `bun run dev` machine are expected. The local Docker image is where those binaries are guaranteed.

## Supply chain

- Bun `minimumReleaseAge = 259200` (3 days).
- `ignoreScripts = true`; only LavaMoat-allowlisted install scripts run (`node-av` for MediaBunny).
- `bun run check-install-scripts` fails CI if a new top-level install script appears.
