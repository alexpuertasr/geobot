import { describe, expect, test } from "vitest";

import { FakeGeoGuessr } from "./support/fake-geoguessr";
import { clientFor, startGame } from "./support/helpers";
import { NotEnoughPlayersError } from "..";

describe.concurrent("starting a game", () => {
  test("joins the party first, since GeoGuessr only counts present players", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);

    const game = await startGame(geoguessr);

    expect(game.id).toBe(fake.gameId);
  });

  test("resolves once GeoGuessr confirms the bot is connected to the game", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);

    await startGame(geoguessr);

    expect(fake.requestsTo("joinGame").length).toBeGreaterThanOrEqual(1);
    expect(fake.received.map(({ message }) => message)).toContainEqual({
      code: "SubscribeToLobby",
      gameId: fake.gameId,
      playerId: fake.hostId,
    });
  });

  test("throws NotEnoughPlayersError, with GeoGuessr's reason, when the bot is alone", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.leaveHostAlone();

    const starting = startGame(geoguessr);

    await expect(starting).rejects.toThrow(NotEnoughPlayersError);
    await expect(starting).rejects.toThrow("Expected 2, got 1");
  });

  test("learns the game from the party when the start response doesn't name it", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.answerStartWithoutGameId();

    const game = await startGame(geoguessr);

    expect(game.id).toBe(fake.gameId);
  });

  test("still enters the game when the start request's answer is lost on the way", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.loseNextResponse("startGame");

    const game = await startGame(geoguessr);

    expect(game.id).toBe(fake.gameId);
    expect(fake.requestsTo("startGame")).toHaveLength(1);
  });
});
