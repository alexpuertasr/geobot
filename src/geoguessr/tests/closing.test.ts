import { describe, expect, test, vi } from "vitest";

import { FakeGeoGuessr } from "./support/fake-geoguessr";
import {
  clientFor,
  gameOver,
  hostLikePlayGame,
  startGame,
} from "./support/helpers";

/*
 * The old client left sockets open when a Lambda returned; frozen, they
 * replayed stale frames and closes into later invocations.
 */
describe.concurrent("closing", () => {
  test("close() unsubscribes from the party and closes both sockets with 4000", async () => {
    await using fake = await FakeGeoGuessr.start();
    const geoguessr = clientFor(fake);
    await startGame(geoguessr);

    await geoguessr.close();

    expect(fake.received.map(({ message }) => message.code)).toContain(
      "Unsubscribe",
    );
    await vi.waitFor(() => {
      expect(fake.openSockets("notification")).toBe(0);
      expect(fake.openSockets("game")).toBe(0);
    });
    expect(fake.closes.map(({ code }) => code)).toEqual([4000, 4000]);
  });

  test("a game closes its own socket once it's over", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);
    hostLikePlayGame(game);

    await gameOver(game);

    await vi.waitFor(() => expect(fake.openSockets("game")).toBe(0));
    expect(fake.closes).toContainEqual({ socket: "game", code: 4000 });
  });

  test("closing mid-game rejects done(), and the client can't be used after", async () => {
    await using fake = await FakeGeoGuessr.start();
    const geoguessr = clientFor(fake);
    const game = await startGame(geoguessr);

    await geoguessr.close();

    await expect(game.done()).rejects.toThrow("closed before it ended");
    await expect(geoguessr.parties.current()).rejects.toThrow(
      "client is closed",
    );
  });
});
