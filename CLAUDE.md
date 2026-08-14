# Project Overview

## Commands

Package manager is pnpm (`packageManager` pinned in package.json).

- `pnpm dev` — `sst dev`: deploys the Lambdas to AWS in live-development mode
- `pnpm deploy` — deploy; production is `pnpx sst deploy --stage production`
- `pnpm check` — Biome lint + format check (`biome check --write .` to fix)
- `pnpm typecheck` — `tsc --noEmit`

`pnpm test` (`sst shell -- playwright test`) runs a live end-to-end challenge: it creates a real GeoGuessr party and plays a real game via the deployed PlayGame Lambda — don't run it casually. Commits must follow Conventional Commits — commitlint runs via a husky `commit-msg` hook.

Secrets are managed with SST: `pnpx sst secret set <Name> <value>`. The secrets are `GeoguessrCookies`, `GoogleMeetsLink`, `SlackBotToken`, `SlackChannel`, `SlackSigningSecret`.

## Architecture

A Slack bot that automates GeoGuessr party games. SST v4 (`sst.config.ts`) defines all infrastructure on AWS (ap-southeast-2): three Lambdas and a cron. Handlers live in `src/functions/`; secrets and function references are accessed in code via `Resource.*` from `sst`.

**SlackHandler** (`slack-handler.ts`) — Slack Bolt app behind a Lambda function URL. Handles the `/create-party` and `/play-game` slash commands and the `start_game` button, each of which async-invokes (`InvocationType: "Event"`) one of the other two Lambdas via the AWS SDK. It must ack within Slack's 3s window, hence the fire-and-forget invokes.

**CreateParty** (`create-party.ts`) — triggered by the weekday cron (10:15 Sydney) or `/create-party`. Disbands any existing party via the client, creates a fresh one, and posts the party join link to Slack with a "start" button.

**PlayGame** (`play-game.ts`) — the long-running game driver (15-minute timeout). Pure orchestration: reads the current party off the client, estimates total game duration from `gameSettings` and refuses to start games that won't fit in the remaining Lambda time, creates the game lobby, and drives the game from the lobby's typed events — announce round starts/finishes to Slack, advance rounds after an 8s transition pause, accumulate leaderboard entries, and post final standings.

**GeoGuessr client layer** (`src/geoguessr/`) — every byte to/from GeoGuessr goes through here; handlers never call the API directly. No browser anywhere: the whole game runs over GeoGuessr's own protocol (captured 2026-08-01).

- `client.ts` — `createGeoClient({ cookies })`, an **async** factory: creation fetches `geoguessr.com/party` once (it 307-redirects to the lobby page), parses the server-rendered `__NEXT_DATA__`, and caches internal state: the current `Party` (or `null` if none) and `xClient` = `web-{buildId}` (what the real web client sends as `X-Client` on every request — best-effort, the servers also accept requests without it). Methods: `currentParty()`, `refreshParty()`, `disbandParty()`, `createParty(options?)`, `createGameLobby()` (the "Start game" `POST game-server.geoguessr.com/api/parties/v2/{partyId}/lobby` — single-shot, returns `null` e.g. on the plain-text 400 it gets until ≥2 players are present, then subscribes and returns a `GameLobby`; the client remembers the game id), `advanceRound(toRoundNumber)` (`POST /api/live-challenge/{gameId}/advance-round`).
- `game-lobby.ts` — `GameLobby`: typed event feed over a single `wss://game-server.geoguessr.com/ws` connection (`ws` package — cookie auth needs custom handshake headers). Sends `SubscribeToLobby` on open and a `HeartBeat` every 15s; `on(code, listener)` is typed against the `gameLobbyEvent` code enum, plus `onError` and `close()`.

**Schemas** (`src/functions/schemas/`) — one zod schema per concern: `party`/`member` (domain objects), `initial-props` (`__NEXT_DATA__` page payload), `create-party`/`create-lobby` (API request/response, with `.prefault({})` so option-less invokes get full defaults), `game-lobby-event` (WebSocket frames). Parsing is deliberately defensive: every unparsed or unknown frame is logged (Powertools structured JSON logging via `src/logger.ts`) so new/changed GeoGuessr event shapes show up in CloudWatch rather than failing silently. Keep that property when touching the frame-handling code.

## Conventions

- Biome enforces formatting and import organization (node → packages → parent → sibling groups, blank-line separated).
- Logging goes through the shared Powertools `logger` with structured context objects — no `console.log`.
