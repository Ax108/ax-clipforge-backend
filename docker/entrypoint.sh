#!/bin/sh
set -e
# Refresh extractor on boot. Versioned images are still the release unit.
if command -v yt-dlp >/dev/null 2>&1; then
  yt-dlp -U || true
fi
exec bun src/server.ts
