# Deployment

## Now (this scaffold)

Two local ways to run the API. **Neither is a public host.**

### 1. Localhost process (daily development)

Requires [Bun](https://bun.sh) on the machine:

```bash
cp .env.example .env   # optional; defaults work
bun install
bun run allow-scripts
bun run dev
```

API: `http://localhost:5000`  
Health: `http://localhost:5000/api/v1/health`

The UI at [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend) runs on `http://localhost:5173` and still uses its **mock** API. You can point `VITE_API_URL` at this server later; that wiring is **not** done yet.

yt-dlp / FFmpeg do **not** need to be installed on Windows for `bun run dev`. Health will report them missing.

### 2. Local Docker image

Requires Docker on the machine. **Does not** require Bun, Node, yt-dlp, FFmpeg, or Python on the host. Those are inside the image.

```bash
bun run docker:up
```

That runs `docker compose up --build`. Image tag: `ax-clipforge-backend:local`. Compose is for **this development machine only**.

Update loop today: edit this git repo → `bun run docker:up` → run again. Do not mutate a running container as a release.

## Env mapping

| Backend          | Frontend (later wiring)                                 |
| ---------------- | ------------------------------------------------------- |
| `PUBLIC_API_URL` | Public origin of this API                               |
| `CORS_ORIGINS`   | Exact browser origins allowed (comma-separated)         |
| —                | `VITE_API_URL` (default `http://localhost:5000/api/v1`) |

`.env.example` includes placeholder Vercel / Netlify / Render origins. They are **stubs**. Do not treat them as live hosts.

Never set CORS to `*` for a real deployment.

## Future (stubs only — not configured)

### Hosted frontend (Vercel / Netlify / Render)

Possible later. **A hosted UI cannot reach Docker on your PC.** The browser would call a **public HTTPS** API. You would:

1. Set frontend `VITE_API_URL` to that public origin + `/api/v1`.
2. Add the frontend origin to `CORS_ORIGINS`.
3. Host the backend image (or reverse-proxy it), not only local Compose.

### Hosted Docker image

Possible later (Fly, Railway, Render, a VPS, GHCR). Compose comments show a placeholder `image: ghcr.io/ax108/ax-clipforge-backend:TAG`. **Do not enable that now.** Release process if you do: git change → new image tag → deploy that tag. `yt-dlp -U` on boot is extra, not the release.

### What operators install

| How they run it     | On the machine |
| ------------------- | -------------- |
| `bun run dev`       | Bun            |
| `bun run docker:up` | Docker only    |
| Browser user        | Browser only   |

## Out of scope here

- Completing yt-dlp download
- Replacing the frontend mock
- Creating a Vercel/Netlify/Render project
- Pushing images to a registry
