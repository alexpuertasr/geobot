import { setTimeout as sleep } from "node:timers/promises";

import {
  type Drift,
  GeoGuessr,
  type LiveChallenge,
  type SdkLogger,
} from "../..";

import type { FakeGeoGuessr } from "./fake-geoguessr";

export type LogEntry = {
  level: string;
  message: string;
  context?: Record<string, unknown>;
};

/** A logger that remembers instead of printing. */
export const recordingLogger = () => {
  const entries: LogEntry[] = [];
  const record =
    (level: string) =>
    (message: string, context?: Record<string, unknown>): void => {
      entries.push({ level, message, context });
    };

  const logger = {
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
  } as unknown as SdkLogger;

  return { logger, entries };
};

/** An SDK client pointed at the fake, with its logs kept for assertions. */
export const clientFor = (
  fake: FakeGeoGuessr,
  options: { timeout?: number } = {},
) => {
  const { logger, entries } = recordingLogger();
  const geoguessr = new GeoGuessr({
    cookies: "session=fake",
    logger,
    baseUrls: fake.baseUrls,
    ...options,
  });
  return Object.assign(geoguessr, { logs: entries });
};

/** What the client reported as drift from the payload shapes, in order. */
export const driftReports = (geoguessr: ReturnType<typeof clientFor>) =>
  geoguessr.logs
    .filter(({ message }) => message === "🧬 GeoGuessr payload drifted")
    .map(({ context }) => context as Drift & { payload: string });

/** Starts the current party's game, as PlayGame does. */
export const startGame = async (geoguessr: GeoGuessr) => {
  const party = await geoguessr.parties.current();
  if (!party) throw new Error("The fake has no party");
  return party.startGame();
};

/**
 * The game's result — or, if it takes longer than any fake game should, a
 * clear timeout instead of the test runner's.
 */
export const gameOver = (game: LiveChallenge, { within = 15_000 } = {}) =>
  game.done({ signal: AbortSignal.timeout(within) });

/**
 * Hosts the game the way PlayGame does — advancing each ended round after a
 * pause — and keeps a log of what happened, e.g. `["started 1", "ended 1"]`.
 */
export const hostLikePlayGame = (
  game: LiveChallenge,
  { pauseMs = 100 } = {},
) => {
  const happened: string[] = [];
  const advances: boolean[] = [];

  game.on("roundStarting", ({ round }) => {
    happened.push(`starting ${round}`);
  });
  game.on("roundStarted", ({ round }) => {
    happened.push(`started ${round}`);
  });
  game.on("roundEnded", async ({ round, isLastRound }) => {
    happened.push(`ended ${round}`);
    if (isLastRound) return;
    await sleep(pauseMs);
    advances.push(await game.advanceRound());
  });
  game.on("finished", () => {
    happened.push("finished");
  });
  game.on("aborted", ({ reason }) => {
    happened.push(`aborted: ${reason}`);
  });

  return { happened, advances };
};

/** Round 1's countdown is only seen if a state read lands in it: ignore it. */
export const withoutFirstCountdown = (happened: string[]) =>
  happened.filter((event) => event !== "starting 1");
