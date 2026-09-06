# ClipForge backend

Express + TypeScript API scaffold for YouTube extract (yt-dlp + MediaBunny). **Initial setup only:** health works; `/info` and `/download` return `501`. The UI at [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend) is **not** wired to this server yet.

![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1+-000000?style=for-the-badge&logo=bun&logoColor=white)

## Now vs later

- **Now:** local Vite UI (`:5173`, [https://github.com/Ax108/ax-clipforge-frontend](https://github.com/Ax108/ax-clipforge-frontend)) + this API on `localhost:5000` and/or **local Docker** on your machine.
- **Not now:** live yt-dlp downloads, frontend mock replacement, Vercel/Netlify/Render, or a public image.

Docs:

- [Architecture](./docs/ARCHITECTURE.md)
- [Deployment](./docs/DEPLOYMENT.md) (local process vs local image; cloud stubs)
- [Maintenance](./docs/MAINTENANCE.md) (yt-dlp updates, cookies/proxy)

## Requirements (localhost process)

- [Bun](https://bun.sh) ≥ 1.0
- Node.js ≥ 24 (engines field)

Docker users need **Docker only** (Bun/yt-dlp/FFmpeg/Python are in the image).

## Setup

```bash
bun install
bun run allow-scripts
bun run dev
```

`bunfig.toml` sets `ignoreScripts = true` and a 3-day `minimumReleaseAge`. Follow install with `bun run allow-scripts` so allow-listed native scripts run (`node-av` for MediaBunny).

Health: `http://localhost:5000/api/v1/health`

Optional env: copy [`.env.example`](./.env.example). Defaults assume local Vite `http://localhost:5173`.

## Scripts

| Command                           | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `bun run dev`                     | Watch the API on port 5000                   |
| `bun start`                       | Run without watch                            |
| `bun verify`                      | Lint, format check, typecheck, tests, Fallow |
| `bun run lint` / `bun run format` | oxlint / oxfmt                               |
| `bun run test`                    | Jest                                         |
| `bun run allow-scripts`           | LavaMoat-allowlisted install scripts         |
| `bun run docker:up`               | `docker compose up --build` (local image)    |

Husky **pre-push** runs `bun verify`. CI on `main` / `develop` runs verify plus an audit job.

## License

Proprietary. Internal use only. Not for sale or distribution.

See [LICENSE](./LICENSE).
