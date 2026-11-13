import { describe, expect, test } from "vitest";

import drifted from "./fixtures/drifted-payloads.json";
import { FakeGeoGuessr } from "./support/fake-geoguessr";
import { clientFor } from "./support/helpers";
import { AuthenticationError, ClosedError, ConnectionError } from "..";

describe("finding the current party", () => {
  test("reads the party and its members from the party page", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);

    const party = await geoguessr.parties.current();

    expect(party?.id).toBe(fake.party.partyId);
    expect(party?.members.map((member) => member.nick)).toEqual([
      "Geobot",
      "Player 1",
    ]);
  });

  test("returns null when the account has no party", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.removeParty();

    expect(await geoguessr.parties.current()).toBeNull();
  });

  test("falls back to the parties API when the party page can't be read", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.serveBrokenPartyPage();

    const party = await geoguessr.parties.current();

    expect(party?.id).toBe(fake.party.partyId);
    expect(fake.requestsTo("activeParty")).toHaveLength(1);
  });

  test("throws AuthenticationError when the session cookies are signed out", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.signOut();

    await expect(geoguessr.parties.current()).rejects.toThrow(
      AuthenticationError,
    );
  });

  test("gives up with a ConnectionError when GeoGuessr doesn't answer in time", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake, { timeout: 300 });
    fake.neverAnswerNext("partyPage");

    await expect(geoguessr.parties.current()).rejects.toThrow(ConnectionError);
  });

  test("retries the party page when GeoGuessr answers 502", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.failNext("partyPage", 502);

    const party = await geoguessr.parties.current();

    expect(party?.id).toBe(fake.party.partyId);
    expect(fake.requestsTo("partyPage")).toHaveLength(2);
  });

  test("treats a party past its expiry as expired, whether GeoGuessr sends epoch ms or an ISO string", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const anHourAgo = Date.now() - 3_600_000;

    fake.party.expiresAt = anHourAgo;
    const fromPage = await geoguessr.parties.current();
    fake.party.expiresAt = new Date(anHourAgo).toISOString();
    fake.serveBrokenPartyPage();
    const fromApi = await geoguessr.parties.current();

    expect(fromPage?.isExpired).toBe(true);
    expect(fromApi?.isExpired).toBe(true);
  });
});

/*
 * Overlapping runs disbanded parties that were mid-game; the E2E test only
 * lets CreateParty replace a party that isn't in use.
 */
describe("telling whether a party is in use", () => {
  test("is in use while a player other than the bot is present", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.setPlayerPresent(true);

    expect((await geoguessr.parties.current())?.isInUse).toBe(true);
  });

  test("is in use while its game is running, even with nobody else present", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.setPlayerPresent(false);
    fake.party.gameState = "Ongoing";

    expect((await geoguessr.parties.current())?.isInUse).toBe(true);
  });

  test("is free when only the bot is present and no game is running", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.setPlayerPresent(false);

    expect((await geoguessr.parties.current())?.isInUse).toBe(false);
  });

  test("counts as in use when the members are unknown, so it's never disbanded blindly", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.setPlayerPresent(false);
    fake.serveBrokenPartyPage();

    expect((await geoguessr.parties.current())?.isInUse).toBe(true);
  });
});

describe("replacing the party, as CreateParty does every weekday", () => {
  test("disbands the current party, after which its handle can't be used", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    const party = await geoguessr.parties.current();

    await party?.disband();

    expect(fake.requestsTo("disbandParty")).toHaveLength(1);
    await expect(party?.startGame()).rejects.toThrow(ClosedError);
  });

  test("creates a Live Challenge party with the requested rounds and default settings", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);

    await geoguessr.parties.create({
      gameSettings: { roundCount: 2, roundTime: 12 },
    });

    expect(fake.requestsTo("createParty")[0]?.body).toMatchObject({
      gameType: "LiveChallenge",
      gameSettings: { roundCount: 2, roundTime: 12, mapSlug: "world" },
    });
  });

  test("creates a party from a response with expiresAt as an ISO string and bannedPlayerIds null", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.createPartyResponse = drifted.createResponse.body;

    const party = await geoguessr.parties.create();

    expect(party.id).toBe(drifted.createResponse.body.partyId);
  });

  test("never retries the create request, even on a 502", async () => {
    await using fake = await FakeGeoGuessr.start();
    await using geoguessr = clientFor(fake);
    fake.failNext("createParty", 502);

    await expect(geoguessr.parties.create()).rejects.toThrow(/502/);
    expect(fake.requestsTo("createParty")).toHaveLength(1);
  });
});
