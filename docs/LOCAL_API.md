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
- `format`: `mp4` \| `mp3` \| `m4a` \| `flac` (default `mp4`). `quality`: mp4 `1080p` / `720p` / `480p` (default `1080p`); mp3 `128kbps` / `256kbps` / `320kbps` (default `320kbps`, passed to yt-dlp as `128K`/`256K`/`320K`); m4a/flac `best` (VBR `0`) or those bitrates. `best` and `320kbps` are different cache keys. Other bitrates and `720p!` are **400**.
- `curl -o file.mp4` always saves **your** copy wherever you point `-o`. That is separate from server `TMP_DIR`.

## Prerequisites

1. API listening on `http://localhost:5000`.
2. Latest **yt-dlp** + **FFmpeg** on PATH (`bun run dev`), or `bun run docker:up` (binaries inside the image).
3. `GET http://localhost:5000/api/v1/health` shows `binaries.ytdlp` and `binaries.ffmpeg` true.

```bash
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

On `bun run dev` with default `KEEP_TMP=true`, also look in `./tmp` for the server-side file.

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

Audio-only example (full track):

```bash
curl -L --fail -o track.mp3 \
  "http://localhost:5000/api/v1/download?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVIDEO_ID&format=mp3&quality=320kbps"
```

## Expected errors (from current handlers)

| Status | When                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Missing/invalid `url`, clip range, quality, malformed JSON, or not a YouTube host (`invalid_url` / `invalid_request` / `invalid_json`) |
| 403    | Link-preview User-Agent on `/download` (`crawler_forbidden`)                                                                           |
| 503    | yt-dlp binary missing (`unavailable`)                                                                                                  |
| 502    | yt-dlp extract/download failed                                                                                                         |

Downloads take as long as yt-dlp + mux. Default timeout `DOWNLOAD_TIMEOUT_MS=600000` (10 minutes). `DOWNLOAD_CONCURRENCY` default `1`.
