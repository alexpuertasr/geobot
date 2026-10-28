import { isPartyInUse } from "@/geoguessr/helpers/party";

import { expect, test } from "./fixtures";

test("runs a live challenge", async ({ guest, geobot }) => {
  test.setTimeout(300_000);

  const { party, members } = await geobot.createParty({
    options: {
      gameSettings: {
        roundCount: 3,
        roundTime: 10,
      },
    },
  });

  if (!party) {
    expect(party).not.toBeNull();
    return;
  }

  test.skip(
    isPartyInUse(party, members),
    "The shared GeoGuessr party is in use (game ongoing or players present); running now would disband it.",
  );

  const player = await guest.create("Player 1", party);

  await expect(
    player.page.getByText("Waiting for host to start the game"),
  ).toBeVisible();

  await geobot.startGame();

  for (let round = 1; round <= party.gameSettings.roundCount; round++) {
    await expect(player.page.getByTestId("guess-map")).toBeVisible();

    await expect(async () => {
      await player.makeGuess();
    }).toPass({ timeout: 30_000 });

    await expect(player.page.getByTestId("guess-map")).toBeHidden();
  }

  await expect(player.page.getByText("Total standings")).toBeVisible();

  await expect(player.page.getByText(player.name).first()).toBeVisible();
});
