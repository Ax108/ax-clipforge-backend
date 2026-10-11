#!/bin/sh
set -e
# Local compose leaves this unset, so the extractor still refreshes on boot.
# Set YTDLP_UPDATE_ON_BOOT=false on Coolify so a running container stays pinned
# to the yt-dlp copied at image build.
if [ "${YTDLP_UPDATE_ON_BOOT:-true}" = "true" ] && command -v yt-dlp >/dev/null 2>&1; then
  yt-dlp -U || true
fi
exec bun src/server.ts
