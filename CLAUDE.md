# Project Overview

## Commands

Package manager is pnpm (`packageManager` pinned in package.json).

- `pnpm dev` — `sst dev`: deploys the Lambdas to AWS in live-development mode
- `pnpm deploy` — deploy; production is `pnpx sst deploy --stage production`
- `pnpm check` — Biome lint + format check (`biome check --write .` to fix)
- `pnpm typecheck` — `tsc --noEmit`

`pnpm test` (`sst shell -- playwright test`) runs a live end-to-end challenge: it creates a real GeoGuessr party and plays a real game via the deployed PlaySession Lambda — don't run it casually. Commits must follow Conventional Commits — commitlint runs via a husky `commit-msg` hook.

Secrets are managed with SST: `pnpx sst secret set <Name> <value>`. The secrets are `GeoguessrCookies`, `GoogleMeetsLink`, `SlackBotToken`, `SlackChannel`, `SlackSigningSecret`.

### Local puppeteer setup (PlaySession only)

In `sst dev`, PlaySession runs with `SST_DEV` set and uses a locally installed Chromium instead of `@sparticuz/chromium`:

```bash
pnpx @puppeteer/browsers install chromium@latest --path /tmp/localChromium
```

Then point `YOUR_LOCAL_CHROMIUM_PATH` in `.env` at the installed binary.

## Architecture

A Slack bot that automates GeoGuessr party games. SST v4 (`sst.config.ts`) defines all infrastructure on AWS (ap-southeast-2): three Lambdas and a cron. Handlers live in `src/functions/`; secrets and function references are accessed in code via `Resource.*` from `sst`.

**SlackHandler** (`slack-handler.ts`) — Slack Bolt app behind a Lambda function URL. Handles the `/start-party` and `/play-session` slash commands and the `start_session` button, each of which async-invokes (`InvocationType: "Event"`) one of the other two Lambdas via the AWS SDK. It must ack within Slack's 3s window, hence the fire-and-forget invokes.

**CreateParty** (`create-party.ts`) — triggered by the weekday cron (10:15 Sydney) or `/start-party`. No browser: `getPartyPageProps` (`src/get-party-page-props.ts`) fetches `geoguessr.com/party` over plain HTTP with the `GeoguessrCookies` header, extracts the server-rendered `__NEXT_DATA__` JSON from the HTML, and validates it with the `initialProps` schema. The handler then posts the party join link to Slack with a "start" button.

**PlaySession** (`play-session.ts`) — the long-running game driver (15-minute timeout). It never scrapes game state from the DOM; instead it opens a CDP session and intercepts WebSocket frames:

- `api.geoguessr.com` sockets carry party events (`partyEvent` schema — note payloads are JSON _strings_, decoded by the `jsonPayload` helper)
- `game-server.geoguessr.com` sockets carry live-challenge session events (`sessionEvent` schema) — all scoring/round data streams over this one socket

Parsed events are re-emitted on a local `EventEmitter` keyed by event `code`, and listeners drive the game: click "Start game"/"Start next round", announce round starts/finishes to Slack, accumulate leaderboard entries, and post final standings. Before starting, it estimates total game duration from `gameSettings` (round count/time from `__NEXT_DATA__`) and refuses to start games that won't fit in the remaining Lambda time.

**Schemas** (`src/functions/schemas/`) — zod schemas for `__NEXT_DATA__` initial props and both WebSocket event families. Parsing is deliberately defensive: every unparsed or unknown frame is logged (Powertools structured JSON logging via `src/logger.ts`) so new/changed GeoGuessr event shapes show up in CloudWatch rather than failing silently. Keep that property when touching the frame-handling code.

## Conventions

- Biome enforces formatting and import organization (node → packages → parent → sibling groups, blank-line separated).
- Logging goes through the shared Powertools `logger` with structured context objects — no `console.log`.
