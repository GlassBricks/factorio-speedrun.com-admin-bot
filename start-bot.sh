#!/usr/bin/env bash

cd "$(dirname "$0")"

pm2 stop bot || true
npm ci && \
  npm run clean && \
  npm run build && \
  pm2 start ./dist/main.js --name bot
