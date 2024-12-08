#!/usr/bin/env bash

pm2 stop bot
npm run clean
npm run build
pm2 start ./dist/main.js --name bot --watch
