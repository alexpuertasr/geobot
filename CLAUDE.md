# Project Overview

## Commands

Package manager is pnpm (`packageManager` pinned in package.json).

- `pnpm dev` — `sst dev`: deploys the Lambdas to AWS in live-development mode
- `pnpm deploy` — deploy; production is `pnpx sst deploy --stage production`
- `pnpm check` — Biome lint + format check (`biome check --write .` to fix)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test:sdk` — Vitest suite for the GeoGuessr SDK (`src/geoguessr/tests/`), run in CI. It plays games against `FakeGeoGuessr`, a local stand-in serving payloads recorded in production, so it needs no network or secrets

`pnpm test` (`sst shell -- playwright test`) runs a live end-to-end challenge: it creates a real GeoGuessr party and plays a real game via the deployed PlayGame Lambda — don't run it casually. Commits must follow Conventional Commits — commitlint runs via a husky `commit-msg` hook.

Secrets are managed with SST: `pnpx sst secret set <Name> <value>`. The secrets are `GeoguessrCookies`, `GeoguessrPlayer1Cookies`, `GoogleMeetsLink`, `SlackBotToken`, `SlackChannel`, `SlackSigningSecret`.

## Architecture

A Slack bot that automates GeoGuessr party games. SST v4 (`sst.config.ts`) defines all infrastructure on AWS (ap-southeast-2): three Lambdas and a cron. Handlers live in `src/functions/`; secrets and function references are accessed in code via `Resource.*` from `sst`.

**SlackHandler** (`slack-handler.ts`) — Slack Bolt app behind a Lambda function URL. Handles the `/create-party` and `/play-game` slash commands and the `start_game` button, each of which async-invokes (`InvocationType: "Event"`) one of the other two Lambdas via the AWS SDK. It must ack within Slack's 3s window, hence the fire-and-forget invokes.

**CreateParty** (`create-party.ts`) — triggered by the weekday cron (10:15 Sydney) or `/create-party`. Disbands any existing party, creates a fresh one, and posts the party join link to Slack with a "start" button. A `tests` run leaves an in-use party alone and returns it with `reused: true` (the E2E test then skips).

**PlayGame** (`play-game.ts`) — the long-running game driver (15-minute timeout). Pure orchestration: reads the current party, refuses games whose `party.estimateGameDuration()` won't fit in the remaining Lambda time, starts the game, and reacts to its events — announce round starts/finishes to Slack, advance rounds after an 8s transition pause (2s for `tests`), then post the final standings from `game.done()` (or say the game was aborted). Slack posts never throw: a Slack outage must not stop a game people are playing.

**GeoGuessr SDK** (`src/geoguessr/`, import from `@/geoguessr`) — what the handlers use; every byte to/from GeoGuessr goes through it. No browser anywhere: the whole game runs over GeoGuessr's own protocol, mirroring the web client's requests, sockets and timings (mapped from its JS bundles and the production logs, 2026-11). Laid out like the Stainless SDKs:

- `client.ts` (`GeoGuessr`), `errors.ts`, `options.ts`, and `index.ts` — the only public entry point.
- `protocol/` — GeoGuessr's wire format: every endpoint (`routes.ts`), socket message (`messages.ts`), close code, and the zod `schemas/`.
- `core/` — shared machinery: the `WebClientIdentity` (cookies, tab id, client version) every request and socket carries, `http/` (requests, GET retries, a log of every response), `socket/` (a reconnecting WebSocket with heartbeat), the notification socket, the client `Lifetime` (what `close()` closes), the typed `Emitter`.
- `resources/` — the handles: `party/` (`Parties` → `Party`) → `live-challenge/` (`LiveChallenge`, with its round tracking, standings wait and stall watchdog split out).

How it behaves:

- `new GeoGuessr(options?)` does no I/O; cookies default to the `GeoguessrCookies` secret. Sockets open when something needs them, and `close()` — or `await using` — shuts every one down, waiting for the closing handshakes so nothing replays after a Lambda thaw. Handles: `geoguessr.parties.current()` / `.create(options?)` → `Party` (`startGame()`, `disband()`, `refresh()`, `connect()`/`disconnect()` for presence, `estimateGameDuration()`, `isInUse`, `joinLink`…) → `LiveChallenge` (`on(event)` for `roundStarting`/`roundStarted`/`roundEnded`/`leaderboardUpdated`/`finished`/`aborted`, `advanceRound()`, `done()`).
- `parties.current()` reads the server-rendered `/party` page like the web client (party, members, and the build id it sends as `X-Client`/`?c=`), falling back to `GET /api/v4/parties/v2/active` (no members, so `isInUse` is then `true`) when the page is unreadable — or has no party, which is how it says there's none but also how a renamed field would look. A signed-out page throws `AuthenticationError`.
- `startGame()` subscribes to the party first — the game server only counts present players — then sends the web client's start request (`routes.startGame`). The game id comes from the response — or, if its answer is lost or doesn't name the game, from a re-read of the party; a 400 "not enough players" throws `NotEnoughPlayersError`. It then joins the game, opens the game socket and resolves on the bot's own `ConnectionOpened` — attach listeners before the next `await`.
- `LiveChallenge` derives round events from the versioned game state (`state.version` only grows) rather than frame codes, so a resync after a reconnect (join + game state) replays whatever was missed; a watchdog re-reads the state if a round overstays. Rounds never advance on their own; `advanceRound()` only fires once the current round has `Ended`, retries transient failures, and resolves `false` when there's nothing to do. `done()` resolves `{ outcome: "finished", standings }` once leaderboard updates go quiet for 5s (max 15s) — final standings still change 0.5–4s after `LiveChallengeFinished` — or `{ outcome: "aborted", reason }`; a failing listener rejects it.
- Sockets: 15s `HeartBeat` plus pings for liveness, close code `4000`, reconnects after 1s/2s/5s (never at once, so a server that drops every connection isn't hammered). The notification socket reconnects forever, and the party re-reads itself after each reconnect; the game socket for up to 60s before the game fails. Only GETs are retried over HTTP (after 1s and 2s, on network errors, 10s timeouts and 502/503/504).
- Errors all extend `GeoGuessrError`, which is itself thrown for closed handles and unexpected response shapes: `APIError` (→ `AuthenticationError`, `NotEnoughPlayersError`) for non-2xx answers, `ConnectionError` (with the close `code` when a socket is lost) when GeoGuessr can't be reached.
- Schemas require only what the SDK reads and keep the rest (`.loose()`); enum-like fields accept any string at runtime but are typed as the known values (`lenientEnum<…>()`). Every frame is logged, and anything unparseable is logged as an error (`parseOrLog`). Keep both properties.

**Game aborts** — the host's "Abort game" (`DELETE game-server.geoguessr.com/api/parties/v2/{partyId}/lobby`) only detaches the party from the game: the party gets `PartyUpdated` with `gameState: "NoGame"` (a normal finish reports `"Finished"`) and the game socket gets `GameAborted`, but the game itself stays alive and still accepts `advance-round`. The SDK ends the game as aborted on whichever arrives first, or on `PartyDisbanded`; the party re-reading itself after a reconnect catches an abort that happened while both sockets were down. Every abort seen in the logs came from someone signed in as the bot account in a browser; the SDK warns when another session opens the game as the host.

## Conventions

- Biome enforces formatting and import organization (node → packages → parent → sibling groups, blank-line separated).
- Logging goes through the shared Powertools `logger` with structured context objects — no `console.log`.
