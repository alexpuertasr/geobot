import type { PartyData } from "../../protocol/schemas/party";

import { MAX_STANDINGS_WAIT_MS } from "./standings-settler";

/* Timings measured over 43 logged games. */

/** From the start request to the first round running. */
const START_MS = 6_000;
/** advance-round's latency (≤1.4s) plus the 5s countdown before each round. */
const ROUND_ADVANCE_MS = 7_000;

/**
 * A conservative estimate, in milliseconds, of a game from `startGame()` to
 * `done()`, given the pause between rounds. `Infinity` without a time limit.
 */
export const estimateGameDuration = (
  { roundCount, roundTime }: PartyData["gameSettings"],
  roundTransitionMs: number,
): number => {
  if (roundTime <= 0) return Number.POSITIVE_INFINITY;

  const rounds = roundCount * roundTime * 1_000;
  const transitions = (roundCount - 1) * (roundTransitionMs + ROUND_ADVANCE_MS);
  return START_MS + rounds + transitions + MAX_STANDINGS_WAIT_MS;
};
