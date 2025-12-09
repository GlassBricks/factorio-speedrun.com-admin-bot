## Project Overview

A Discord bot for the Factorio speedrunning community that integrates with speedrun.com (src) to announce new submissions, track player activity, and manage community discussions and voting.

## Development Commands

### Build and Run

- `npm run build` - Clean and compile TypeScript (uses tsconfig-release.json)
- `npm run clean` - Remove compiled output directory
- `npm run dev` - Run in development mode with auto-reload (requires prior build)
- `npm run watch` - Watch mode for TypeScript compilation

### Code Quality

- `npm run lint` - Run ESLint and Prettier checks
- `npm run lint:fix` - Auto-fix linting and formatting issues
- `npm run check` - Run both linting and type checking (no emit)

### Database Migrations

- `npm run migrate` - Run pending migrations
- `npm run migrate:status` - Check migration status
- `npm run migrate:undo` - Undo last migration
- `npm run migrate:undo:all` - Undo all migrations

### Development Workflow

1. Make code changes in `src/`
2. Run `npm run build` to compile
3. Run `npm run dev` to start with hot reload
4. In a separate terminal, run `npm run watch` for continuous compilation

## Architecture

### Framework and Structure

Built on **Sapphire Framework** (Discord.js-based). Commands, events, and listeners are automatically loaded from `src/commands/`, `src/listeners/`, and similar directories through Sapphire's plugin system.

### Configuration System

Runtime configuration is loaded from `config.js` (production) or `config.dev.js` (development) in the project root. These files export a `Config` object defined in `src/config-file.ts` that controls all bot features.

Key configuration interfaces:

- `VoteInitiateCommandConfig` - Configures voting commands with reaction thresholds
- `AnnounceSrcSubmissionsConfig` - Controls speedrun.com submission announcements
- `AnnounceFactorioVersionConfig` - Monitors new Factorio releases
- `DiscussionModerationConfig` - Manages discussion channels and user reports
- `MessageRelayConfig` / `AnnouncementRelayConfig` - Cross-channel message forwarding

### Database Architecture

Uses **Sequelize-TypeScript** with SQLite. In development mode (`NODE_ENV=development`), the database is in-memory. In production, data persists to `database.sqlite`.

Models are defined in `src/db/index.ts`:

- `VoteInitiateMessage` - Tracks active vote messages
- `KnownFactorioVersion` - Stores last known Factorio version
- `SrcRun` - Tracks speedrun submissions and their announcement status
- `MessageReport` - User reports on messages
- `DiscussionBan` - Temporary user bans
- `AnnounceMessage` - Links source and destination announcement messages

Database sync happens automatically on startup (`src/db/migrate.ts`):

- Development: `sequelize.sync()` auto-creates tables
- Production: Checks and runs pending migrations via `sequelize-cli`

### Component System

"Components" in `src/components/` are major features that set themselves up when the client is ready:

- **announce-src-submissions.ts** - Polls speedrun.com for new runs, posts formatted embeds with run details, updates on status changes (verified/rejected)
- **announce-factorio-version.ts** - Checks for new Factorio releases via cron
- **vote-initiate.ts** - Creates vote commands that post messages with reaction tracking; passes/fails based on thresholds
- **discussion-moderate.ts** - Handles message reports, temp bans, discussion channel access
- **announcement-relay.ts** - Relays announcements between channels with confirmation reactions
- **error-handling.ts** - Centralized error handling utilities

Each component reads its configuration from the main config object and registers event listeners or scheduled jobs as needed.

### External Integrations

- **speedrun.com API** - Uses `src-ts` package to fetch run data, leaderboards, and player information
- **Twitch** - Integration defined in `src/twitch.ts` (used for player streaming info)
- **Factorio version checking** - Polls Factorio's API for new releases

### Message Version System

`announce-src-submissions.ts` uses a `MESSAGE_VERSION` constant. When the format changes, increment this version to trigger updates to all existing messages in the database.

## TypeScript Standards

- Strict mode enabled (`"strict": true`)
- Use functional programming style where practical
- Avoid deep nesting: return early or extract functions
- Prefer self-documenting code through naming over comments
