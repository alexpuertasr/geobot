import { describe, expect, test } from "vitest";

import { FakeGeoGuessr } from "./support/fake-geoguessr";
import {
  clientFor,
  gameOver,
  hostLikePlayGame,
  startGame,
} from "./support/helpers";

/* What a finished game hands back for the games database to store as is. */
describe.concurrent("recording a game", () => {
  test("hands back what GeoGuessr sent from the start request to the final standings' update", async () => {
    await using fake = await FakeGeoGuessr.start("recorded");
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    hostLikePlayGame(game);

    const { recording } = await gameOver(game);

    const kindsFrom = (source: string) =>
      recording.filter((p) => p.source === source).map((p) => p.kind);
    expect(kindsFrom("http")[0]).toBe("startGame");
    expect(kindsFrom("http")).toContain("advanceRound");
    expect(kindsFrom("game")).toEqual([
      "ConnectionOpened",
      "LiveChallengeStarted",
      "LiveChallengeRoundEnded",
      "LiveChallengeLeaderboardUpdate",
      "LiveChallengeRoundStarting",
      "LiveChallengeRoundStarted",
      "LiveChallengeRoundEnded",
      "LiveChallengeFinished",
      // Sent after the finish, with the final standings.
      "LiveChallengeLeaderboardUpdate",
    ]);
  });

  test("keeps party payloads as JSON, with their access tokens redacted", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.party.chatAccessToken = "party-chat-secret";
    const game = await startGame(geoguessr);
    hostLikePlayGame(game);

    const { recording } = await gameOver(game);

    const partyUpdate = recording.find(({ kind }) => kind === "PartyUpdated");
    expect(partyUpdate?.body).toMatchObject({
      payload: { chatAccessToken: "[redacted]" },
    });
    expect(JSON.stringify(recording)).not.toContain("party-chat-secret");
  });

  test("keeps each frame exactly as sent, even a field that no longer reads as described", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    hostLikePlayGame(game);
    game.once("roundStarted", () => {
      fake.sendGameFrame({ code: "ConnectionClosed", playerId: 42 });
      fake.sendPartyFrame("PartyHostEditingSettings", {}, { client: 42 });
    });

    const { recording } = await gameOver(game);

    const bodyOf = (code: string) =>
      recording.find(({ kind }) => kind === code)?.body;
    expect(bodyOf("ConnectionClosed")).toMatchObject({ playerId: 42 });
    expect(bodyOf("PartyHostEditingSettings")).toMatchObject({ client: 42 });
  });
});
