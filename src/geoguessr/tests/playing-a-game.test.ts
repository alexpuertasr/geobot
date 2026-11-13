import { describe, expect, test } from "vitest";

import { FakeGeoGuessr } from "./support/fake-geoguessr";
import {
  clientFor,
  gameOver,
  hostLikePlayGame,
  startGame,
  withoutFirstCountdown,
} from "./support/helpers";

describe.concurrent("playing a recorded production game", () => {
  test("announces its rounds in order and advances once, to round 2", async () => {
    await using fake = await FakeGeoGuessr.start("recorded");
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    const { happened } = hostLikePlayGame(game);

    await gameOver(game);

    expect(withoutFirstCountdown(happened)).toEqual([
      "started 1",
      "ended 1",
      "starting 2",
      "started 2",
      "ended 2",
      "finished",
    ]);
    expect(fake.requestsTo("advanceRound").map(({ body }) => body)).toEqual([
      { toRoundNumber: 2 },
    ]);
  });

  test("reports the final standings from the update sent after the game finished", async () => {
    await using fake = await FakeGeoGuessr.start("recorded");
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    hostLikePlayGame(game);

    const result = await gameOver(game);

    // The finish frame came with 90 points; the last guesses scored 17 more.
    expect(result.outcome).toBe("finished");
    expect(result.standings.map(({ score }) => score)).toEqual([107]);
  });
});

describe.concurrent("advancing rounds", () => {
  test("advanceRound() resolves false without calling GeoGuessr while the round is still being played", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);

    const advanced = await new Promise<boolean>((resolve) =>
      game.once("roundStarted", () => resolve(game.advanceRound())),
    );

    expect(advanced).toBe(false);
    expect(fake.requestsTo("advanceRound")).toHaveLength(0);
  });

  test("stands down when another session already advanced the round, instead of skipping one", async () => {
    await using fake = await FakeGeoGuessr.start({ rounds: 3 });
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    const { happened, advances } = hostLikePlayGame(game, { pauseMs: 400 });
    game.once("roundEnded", () => {
      setTimeout(() => fake.advanceFromBrowser(), 100);
    });

    await gameOver(game);

    expect(advances).toEqual([false, true]);
    expect(withoutFirstCountdown(happened)).toEqual([
      "started 1",
      "ended 1",
      "starting 2",
      "started 2",
      "ended 2",
      "starting 3",
      "started 3",
      "ended 3",
      "finished",
    ]);
  });

  test("retries when GeoGuessr answers 502", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    const { advances } = hostLikePlayGame(game);
    fake.failNext("advanceRound", 502);

    const result = await gameOver(game);

    expect(result.outcome).toBe("finished");
    expect(advances).toEqual([true]);
    expect(fake.requestsTo("advanceRound")).toHaveLength(2);
  });

  test("counts an advance whose answer was lost, without sending it twice", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    const { advances } = hostLikePlayGame(game);
    fake.loseNextResponse("advanceRound");

    const result = await gameOver(game);

    expect(result.outcome).toBe("finished");
    expect(advances).toEqual([true]);
    expect(fake.requestsTo("advanceRound")).toHaveLength(1);
  });
});
