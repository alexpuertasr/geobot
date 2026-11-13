import { expect, test } from "./fixtures";

test("runs a live challenge", async ({ player, geobot }) => {
  test.setTimeout(300_000);

  const result = await geobot.createParty({
    options: {
      gameSettings: {
        roundCount: 2,
        roundTime: 12,
      },
    },
  });

  if (!result.party) {
    expect(result.party).not.toBeNull();
    return;
  }

  const { party, joinLink, reused } = result;

  test.skip(
    reused,
    "The shared GeoGuessr party is in use (game ongoing or players present); running now would disband it.",
  );

  const player1 = await player.join("player-1", joinLink);

  await expect(
    player1.page.getByText("Waiting for host to start the game"),
  ).toBeVisible();

  await geobot.startGame();

  for (let round = 1; round <= party.gameSettings.roundCount; round++) {
    await expect(player1.page.getByTestId("guess-map")).toBeVisible();

    await expect(async () => {
      await player1.makeGuess();
    }).toPass({ timeout: 30_000 });

    await expect(player1.page.getByTestId("guess-map")).toBeHidden();
  }

  await expect(player1.page.getByText("Total standings")).toBeVisible();

  await expect(player1.page.getByText(player1.name).first()).toBeVisible();
});
