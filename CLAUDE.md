## Project Overview

A Discord bot for the Factorio speedrunning community that integrates with speedrun.com to announce submissions, track players, and manage community voting.

## Development Commands

- `npm run build` - Clean and compile TypeScript
- `npm run dev` - Run with auto-reload (requires prior build)
- `npm run watch` - Watch mode for TypeScript compilation
- `npm run lint`, `npm run lint:fix`
- `npm run check` - Linting and type checking

## Architecture

Built on **Sapphire Framework** (Discord.js-based). Commands, events, and listeners auto-load from `src/commands/`, `src/listeners/`, etc.

Runtime config loads from `config.js` (prod) or `config.dev.js` (dev), typed by `src/config-file.ts`.

Uses **Sequelize-TypeScript** with SQLite. Dev mode uses in-memory DB. Production runs migrations automatically on startup via `src/db/migrate.ts`.

Components in `src/components/` are major features that self-register on client ready.

### External Integrations

- **speedrun.com API** via `src-ts` package
- **Twitch** integration in `src/twitch.ts`
- **Factorio version checking** polls Factorio's API

### Message Version System

`announce-src-submissions.ts` uses a `MESSAGE_VERSION` constant. Increment it when the embed format changes to trigger updates to all existing messages.

## Code

- Run eslint after changes
- Run prettier fix after changes
