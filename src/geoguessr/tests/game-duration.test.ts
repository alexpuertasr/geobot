import { describe, expect, test } from "vitest";

import { estimateGameDuration } from "../resources/live-challenge/game-duration";

const PLAY_GAME_TIMEOUT_MS = 15 * 60_000;
const PLAY_GAME_SAFETY_BUFFER_MS = 60_000;

describe("estimating a game's duration", () => {
  // Real 5 × 90s games took 515s from the start request to the finish, and
  // final standings settled within 4s more.
  test("covers a real 5-round, 90-second game, and still fits in PlayGame's 15 minutes", () => {
    const estimate = estimateGameDuration(
      { roundCount: 5, roundTime: 90 },
      8_000,
    );

    expect(estimate).toBeGreaterThanOrEqual(519_000);
    expect(estimate + PLAY_GAME_SAFETY_BUFFER_MS).toBeLessThan(
      PLAY_GAME_TIMEOUT_MS,
    );
  });

  test("can't bound a game whose rounds have no time limit", () => {
    expect(estimateGameDuration({ roundCount: 5, roundTime: 0 }, 8_000)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});
