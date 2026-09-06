# Local-only image. Python + Node (yt-dlp n-sig) + FFmpeg libs + yt-dlp + Bun API.
# Operators who run this image do not need Bun or yt-dlp on the host.
FROM oven/bun:1

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    nodejs \
    python3 \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL -o /usr/local/bin/yt-dlp \
    https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json tsconfig.src.json tsconfig.no-tests.json ./
COPY .oxlintrc.json .oxfmtrc.json .fallowrc.json ./
COPY docker/entrypoint.sh /entrypoint.sh

RUN bun install --frozen-lockfile \
  && bun run allow-scripts \
  && chmod +x /entrypoint.sh

ENV PORT=5000
ENV PUBLIC_API_URL=http://localhost:5000
ENV CORS_ORIGINS=http://localhost:5173
EXPOSE 5000

ENTRYPOINT ["/entrypoint.sh"]
