#!/usr/bin/env bash

pm2 stop bot
npm ci
npm run clean
npm run build
pm2 start ./dist/main.js --name bot
