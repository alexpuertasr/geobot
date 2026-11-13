import { describe, expect, test } from "vitest";

import { FakeGeoGuessr } from "./support/fake-geoguessr";
import { clientFor, gameOver, startGame } from "./support/helpers";

describe.concurrent("waiting for a game", () => {
  test("fails the game with a listener's error, so a broken handler can't go unnoticed", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);

    game.on("roundStarted", async () => {
      throw new Error("Slack is down");
    });

    await expect(gameOver(game, { within: 3_000 })).rejects.toThrow(
      "Slack is down",
    );
  });

  test("gives up waiting with the signal's reason when the deadline passes first, leaving the game running", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);

    const waiting = game.done({ signal: AbortSignal.timeout(100) });

    await expect(waiting).rejects.toThrow(/timed? ?out/i);
    expect(game.isLive).toBe(true);
  });
});
