import { describe, expect, test, vi } from "vitest";

import { FakeGeoGuessr } from "./support/fake-geoguessr";
import {
  clientFor,
  gameOver,
  hostLikePlayGame,
  startGame,
  withoutFirstCountdown,
} from "./support/helpers";

/*
 * Every abort in the production logs came from someone signed in as the bot
 * in a browser, and each time the bot kept advancing the orphaned game.
 */
describe.concurrent("when a game is aborted", () => {
  test("ends as aborted on GameAborted alone while the party connection is down", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    game.once("roundStarted", () => {
      fake.dropSocket("notification", { refuseFor: 60_000 });
      fake.abortFromBrowser();
    });

    const result = await gameOver(game, { within: 3_000 });

    expect(result).toMatchObject({ outcome: "aborted", reason: "gameAborted" });
  });

  test("ends as aborted on the party's word alone, without a GameAborted frame", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    game.once("roundStarted", () => fake.detachPartyFromGame());

    const result = await gameOver(game);

    expect(result).toMatchObject({ outcome: "aborted", reason: "gameAborted" });
  });

  test("ends as aborted when the party is disbanded mid-game", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    game.once("roundStarted", () => fake.disbandFromBrowser());

    const result = await gameOver(game);

    expect(result).toMatchObject({
      outcome: "aborted",
      reason: "partyDisbanded",
    });
  });

  test("stops advancing rounds once the game is aborted during the pause between them", async () => {
    await using fake = await FakeGeoGuessr.start({ rounds: 3 });
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    const { happened, advances } = hostLikePlayGame(game, { pauseMs: 500 });
    game.once("roundEnded", () => {
      setTimeout(() => fake.abortFromBrowser(), 100);
    });

    await gameOver(game);
    await vi.waitFor(() => expect(advances).toHaveLength(1));

    expect(advances).toEqual([false]);
    expect(fake.requestsTo("advanceRound")).toHaveLength(0);
    expect(withoutFirstCountdown(happened)).toEqual([
      "started 1",
      "ended 1",
      "aborted: gameAborted",
    ]);
  });

  test("hands back a game that is already over when it's aborted while joining", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.duringNext("joinGame", () => fake.abortFromBrowser());

    const game = await startGame(geoguessr);

    expect(game.isLive).toBe(false);
    expect(await gameOver(game)).toMatchObject({ outcome: "aborted" });
  });
});
