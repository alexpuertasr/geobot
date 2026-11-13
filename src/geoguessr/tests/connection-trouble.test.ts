import { describe, expect, test, vi } from "vitest";

import { PACE } from "./support/fake-game";
import { FakeGeoGuessr } from "./support/fake-geoguessr";
import {
  clientFor,
  gameOver,
  hostLikePlayGame,
  startGame,
} from "./support/helpers";
import { ConnectionError } from "..";

describe.concurrent("when the connection to GeoGuessr misbehaves", () => {
  // Nov 10: the game socket closed with 1006 mid-round and the game was lost.
  test("re-reads the game as soon as the game socket is back, recovering a round that ended meanwhile", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    const { happened } = hostLikePlayGame(game);
    game.once("roundStarted", () => {
      setTimeout(
        () => fake.dropSocket("game", { refuseFor: PACE.roundLength }),
        PACE.roundLength / 2,
      );
    });

    // Well before the stall watchdog would step in (5s past the round's end).
    await vi.waitFor(() => expect(happened).toContain("ended 1"), {
      timeout: 4_000,
    });
    expect(fake.undelivered).toContain("LiveChallengeRoundEnded");
    expect((await gameOver(game)).outcome).toBe("finished");
  });

  test("notices an abort that happened while both sockets were down", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    game.once("roundStarted", () => {
      fake.dropSocket("notification", { refuseFor: 500 });
      fake.dropSocket("game", { refuseFor: 500 });
      setTimeout(() => fake.abortFromBrowser(), 100);
    });

    const result = await gameOver(game);

    expect(result).toMatchObject({ outcome: "aborted", reason: "gameAborted" });
  });

  test("fails the game at once when another session takes over the game socket", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);

    fake.handGameSocketToAnotherSession();

    const failure = gameOver(game, { within: 3_000 });

    await expect(failure).rejects.toThrow(ConnectionError);
    await expect(failure).rejects.toMatchObject({ code: 4100 });
  });

  // Oct 15: a 1012 closed the party socket, and the old client never
  // reconnected it.
  test("re-joins the party after GeoGuessr restarts its notification server", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const party = await geoguessr.parties.current();
    await party?.connect();

    fake.restartNotificationServer();

    await vi.waitFor(
      () => {
        const subscribes = fake.received.filter(
          ({ message }) => message.code === "Subscribe",
        );
        expect(subscribes).toHaveLength(2);
      },
      { timeout: 3_000 },
    );
  });

  test("waits a second between reconnects while GeoGuessr drops every connection right after accepting it", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const party = await geoguessr.parties.current();
    const healthy = new Promise((resolve) =>
      party?.once("membersUpdated", resolve),
    );
    await party?.connect();
    await healthy;

    fake.dropEveryConnection("notification");

    await vi.waitFor(() => expect(fake.connections).toHaveLength(4), {
      timeout: 6_000,
    });
    const [, ...reconnects] = fake.connections.map(({ at }) => at);
    const gaps = reconnects.slice(1).map((at, i) => at - (reconnects[i] ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(950);
  });

  test("reads the game state when a round runs late and no frame said it ended", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    const { happened } = hostLikePlayGame(game);
    fake.loseNextGameFrame("LiveChallengeRoundEnded");

    const result = await gameOver(game);

    expect(happened).toContain("ended 1");
    expect(result.outcome).toBe("finished");
  });

  // Leaked sockets replayed frames on the next Lambda thaw.
  test("announces each round once, even when a frame arrives twice", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    const { happened } = hostLikePlayGame(game, { pauseMs: 300 });
    game.once("roundEnded", () =>
      fake.resendGameFrame("LiveChallengeRoundEnded"),
    );

    await gameOver(game);

    expect(happened.filter((event) => event === "ended 1")).toHaveLength(1);
  });

  test("ignores a replayed frame older than the state it already has", async () => {
    await using fake = await FakeGeoGuessr.start({ rounds: 3 });
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    const { advances } = hostLikePlayGame(game);
    game.on("roundEnded", ({ round }) => {
      if (round === 2) fake.resendGameFrame("LiveChallengeRoundStarted");
    });

    const result = await gameOver(game);

    expect(result.outcome).toBe("finished");
    expect(advances).toEqual([true, true]);
  });
});
