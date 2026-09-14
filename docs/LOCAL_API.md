# Local API testing (no frontend)

Source of truth: `src/config/env.ts`, `src/lib/cache-key.ts`, `src/services/job.service.ts`, `src/config/request.ts`.

Use this when running **only** the backend. You do not need the Vite UI.

## Cache and `KEEP_TMP`

Same YouTube id + format + quality + (`full` or `start-end`) is stored under `tmp/cache/` and **reused**. That skips yt-dlp and ffmpeg for repeats.

| How you run the API | `KEEP_TMP`         | Cache                                                                                                  |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `bun run dev`       | **true** (default) | `./tmp/cache` kept. No TTL eviction.                                                                   |
| Docker              | **false**          | `/tmp/clipforge/cache` reused until `CACHE_TTL_MS` / `CACHE_MAX_BYTES`. Not deleted after each stream. |

Redis: Compose sets `REDIS_URL`. Empty `REDIS_URL` = in-memory jobs; file cache still works.

Confirm: `GET /api/v1/health` → `tmp.keepTmp`, `jobs.store`.

## Agent notes

- Clip vs full is query/body fields, not a `mode` flag. Omit `start` and `end` for a full extract. Send **both** `start` and `end` (seconds or `HH:MM:SS`) for a trimmed clip. `end` must be greater than `start` or the API returns **400**. `start=0&end=0` is treated as full (no `--download-sections`). One bound without the other is **400**, not a full download.
- `format`: `mp4` \| `mp3` \| `m4a` \| `flac` (default `mp4` on `/download` and `/jobs`). `quality`: mp4 `1080p` / `720p` / `480p` (default `1080p`); mp3 `128kbps` / `256kbps` / `320kbps` (default `320kbps`, passed to yt-dlp as `128K`/`256K`/`320K`); m4a/flac `best` (VBR `0`) or those bitrates. `best` and `320kbps` are different cache keys. Other bitrates and `720p!` are **400**.
- Dedicated audio: `GET`/`POST /api/v1/audio` (and `POST /api/v1/audio/jobs`). Same clip/quality rules. `format` default `mp3`; only `mp3` \| `m4a` \| `flac`. `format=mp4` is **400**. Same cache key as `/download?format=mp3` (or m4a/flac) with the same quality and range.
- `curl -o file.mp4` always saves **your** copy wherever you point `-o`. That is separate from server `TMP_DIR`.

## Prerequisites

1. API listening on `http://localhost:5000`.
2. For **`bun run dev`:** latest **yt-dlp** + **FFmpeg** must be resolvable by that process — on `PATH`, or set `YTDLP_BIN` to an absolute path (Windows WinGet installs often need a new shell or an explicit path). For **Docker** (`bun run docker:up`): binaries are in the image; host PATH does not matter.
3. `GET http://localhost:5000/api/v1/health` shows `binaries.ytdlp` and `binaries.ffmpeg` **true**. If `ytdlp` is false, extract routes return **503** until PATH/`YTDLP_BIN` is fixed.

```bash
# bun run dev — confirm the same shell can see the tools:
yt-dlp --version
ffmpeg -version
bun run dev
# other terminal:
curl -sS http://localhost:5000/api/v1/health
```

## Inspect `./tmp` on local `bun run dev`

Default `KEEP_TMP=true`. After a download:

```bash
ls tmp/cache
```

Names look like `{youtubeId}_{format}_{quality}_{full|start-end}.{format}` (`.mp4`, `.mp3`, `.m4a`, or `.flac`). Gitignored.

Docker: files stay **inside** the container cache until eviction. Use `curl -o clip.mp4` for a copy on the host. `curl -C - -o clip.mp4 URL` resumes a dropped transfer.

## Health

```bash
curl -sS http://localhost:5000/api/v1/health
```

## robots.txt

Search engines should not index this API host:

```bash
curl -sS http://localhost:5000/robots.txt
# User-agent: *
# Disallow: /
```

Responses also send `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`.

## Info (metadata JSON)

`POST /api/v1/info` body: `{ "url": "<youtube url or 11-char id>" }`.

```bash
curl -sS -X POST http://localhost:5000/api/v1/info \
  -H "content-type: application/json" \
  -d "{\"url\":\"https://www.youtube.com/watch?v=VIDEO_ID\"}"
```

Replace `VIDEO_ID` with an 11-character id. `parseYouTubeId` also accepts watch / shorts / live / `youtu.be` / raw id.

## Download — full video

`GET` or `POST /api/v1/download`. Required: `url`. Optional: `format` (default `mp4`), `quality` (default `1080p`). **Do not send `start`/`end`.**

Encode the watch URL in the query string.

```bash
# GET full MP4 (480p). -L follows redirects; --fail errors on 4xx/5xx.
curl -L --fail -o full.mp4 \
  "http://localhost:5000/api/v1/download?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVIDEO_ID&format=mp4&quality=480p"
```

`-OJ` uses `Content-Disposition` for the filename (the yt-dlp stamp name):

```bash
curl -L --fail -OJ \
  "http://localhost:5000/api/v1/download?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVIDEO_ID&format=mp4&quality=480p"
```

Same job as POST JSON:

```bash
curl -L --fail -o full.mp4 \
  -X POST http://localhost:5000/api/v1/download \
  -H "content-type: application/json" \
  -d "{\"url\":\"https://www.youtube.com/watch?v=VIDEO_ID\",\"format\":\"mp4\",\"quality\":\"480p\"}"
```

Browser: paste the same GET URL in the address bar. The browser download UI saves the attachment.

On `bun run dev` with default `KEEP_TMP=true`, also look in `./tmp/cache` for the server-side file.

## Download — trimmed clip

Send **both** `start` and `end`. Values are seconds or `HH:MM:SS` (`parseTimeToSeconds`). This adds yt-dlp `--download-sections *START-END` and `--force-keyframes-at-cuts`.

```bash
# Clip 0s-30s, 480p MP4
curl -L --fail -o clip.mp4 \
  "http://localhost:5000/api/v1/download?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVIDEO_ID&format=mp4&quality=480p&start=0&end=30"
```

```bash
# Clip 1:00-1:30 via POST
curl -L --fail -o clip.mp4 \
  -X POST http://localhost:5000/api/v1/download \
  -H "content-type: application/json" \
  -d "{\"url\":\"https://www.youtube.com/watch?v=VIDEO_ID\",\"format\":\"mp4\",\"quality\":\"720p\",\"start\":\"01:00\",\"end\":\"01:30\"}"
```

Audio-only via `/download` (still valid; same cache as `/audio`):

```bash
curl -L --fail -o track.mp3 \
  "http://localhost:5000/api/v1/download?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVIDEO_ID&format=mp3&quality=320kbps"
```

## Audio-only — dedicated endpoint

`GET` or `POST /api/v1/audio`. Required: `url`. Optional: `format` (`mp3` \| `m4a` \| `flac`, default `mp3`), `quality` (mp3 default `320kbps`; m4a/flac default `best`). Clip with **both** `start` and `end`, same as `/download`. Do not send `format=mp4`.

Progress jobs: `POST /api/v1/audio/jobs`, then the existing `GET /api/v1/jobs/:id/events` and `GET /api/v1/jobs/:id/file`.

```bash
# Full MP3 (default format + 320kbps)
curl -L --fail -o track.mp3 \
  "http://localhost:5000/api/v1/audio?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVIDEO_ID"
```

```bash
# FLAC via POST JSON
curl -L --fail -o track.flac \
  -X POST http://localhost:5000/api/v1/audio \
  -H "content-type: application/json" \
  -d "{\"url\":\"https://www.youtube.com/watch?v=VIDEO_ID\",\"format\":\"flac\"}"
```

```bash
# Clip 0s-30s, 256kbps MP3
curl -L --fail -o clip.mp3 \
  "http://localhost:5000/api/v1/audio?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVIDEO_ID&format=mp3&quality=256kbps&start=0&end=30"
```

```bash
# Start a job (SSE + file stay on /jobs/:id)
curl -sS -X POST http://localhost:5000/api/v1/audio/jobs \
  -H "content-type: application/json" \
  -d "{\"url\":\"https://www.youtube.com/watch?v=VIDEO_ID\",\"format\":\"m4a\"}"
```

## Expected errors (from current handlers)

| Status | When                                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Missing/invalid `url`, clip range, quality, `format=mp4` on `/audio`, malformed JSON, or not a YouTube host (`invalid_url` / `invalid_request` / `invalid_json`) |
| 403    | Link-preview User-Agent on `/download`, `/audio`, `POST /jobs`, `POST /audio/jobs`, or `GET /jobs/:id/file` (`crawler_forbidden`)                                |
| 429    | IP exceeded rate limit (`rate_limited`). Defaults: 10 extract starts / 15 min; see `RATE_LIMIT_*` in `.env.example`. `/health` and `/robots.txt` are exempt.     |
| 503    | A cache miss needs yt-dlp and the binary is missing (`unavailable`)                                                                                              |
| 502    | yt-dlp extraction/download fails, including operations that require an unavailable FFmpeg                                                                        |

Downloads take as long as yt-dlp + mux. Default timeout `DOWNLOAD_TIMEOUT_MS=600000` (10 minutes). `DOWNLOAD_CONCURRENCY` default `1`. Rapid repeated curl of `/download` or `/jobs` from the same IP can hit **429** before yt-dlp runs.
