import { describe, expect, test } from "vitest";

import { FakeGeoGuessr } from "./support/fake-geoguessr";
import {
  clientFor,
  driftReports,
  gameOver,
  hostLikePlayGame,
  startGame,
} from "./support/helpers";

/*
 * The schemas describe every payload as GeoGuessr has sent it, so a change
 * on its side shows up in the logs before it shows up in the stored games.
 */
describe.concurrent("when GeoGuessr changes what it sends", () => {
  test("reads a real production game without reporting any drift", async () => {
    await using fake = await FakeGeoGuessr.start("recorded");
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    hostLikePlayGame(game);

    await gameOver(game);

    expect(driftReports(geoguessr)).toEqual([]);
  });

  // GameAborted, ConnectionClosed and PartyHostEditingSettings each broke the
  // old client's parsing the first time GeoGuessr sent them.
  test("plays on through frame codes and party states it has never seen, reporting each", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    hostLikePlayGame(game);
    game.once("roundStarted", () => {
      fake.sendGameFrame({ code: "LiveChallengeSomethingNew" });
      fake.sendPartyFrame("PartyUpdated", {
        ...fake.party,
        gameState: "Paused",
      });
    });

    const result = await gameOver(game);

    expect(result.outcome).toBe("finished");
    expect(geoguessr.logs.filter(({ level }) => level === "error")).toEqual([]);
    expect(driftReports(geoguessr)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: "GameFrame",
          kind: "newValue",
          path: "code",
          detail: "LiveChallengeSomethingNew",
        }),
        expect.objectContaining({
          payload: "Party",
          kind: "newValue",
          path: "gameState",
          detail: "Paused",
        }),
      ]),
    );
  });

  test("reports a field GeoGuessr adds once, however often it arrives, saying where it is", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    hostLikePlayGame(game);
    game.once("roundStarted", () => {
      for (const seat of [1, 2, 3]) {
        fake.sendGameFrame({ code: "ConnectionOpened", playerId: "p", seat });
      }
    });

    await gameOver(game);

    const reports = driftReports(geoguessr).filter(
      ({ detail }) => detail === "seat",
    );
    expect(reports).toEqual([
      {
        payload: "GameFrame",
        kind: "newField",
        path: "seat",
        detail: "seat",
        sample: "1",
      },
    ]);
  });
});
