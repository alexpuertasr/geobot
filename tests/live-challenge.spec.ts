import { expect, test } from "./fixtures";

test("runs a live challenge", async ({ guest, geobot }) => {
  test.setTimeout(600_000);

  const party = await geobot.createParty({
    options: {
      gameSettings: {
        roundCount: 3,
        roundTime: 15,
      },
    },
  });

  const player = await guest.create("Player 1", party);

  await expect(
    player.page.getByText("Waiting for host to start the game"),
  ).toBeVisible();

  await geobot.startGame();

  for (let round = 1; round <= party.gameSettings.roundCount; round++) {
    await expect(player.page.getByTestId("guess-map")).toBeVisible({
      timeout: round === 1 ? 240_000 : 60_000,
    });

    await expect(async () => {
      await player.makeGuess();
    }).toPass({ timeout: 90_000 });

    await expect(player.page.getByTestId("guess-map")).toBeHidden({
      timeout: 60_000,
    });
  }

  await expect(player.page.getByText("Total standings")).toBeVisible({
    timeout: 60_000,
  });

  await expect(player.page.getByText(player.name).first()).toBeVisible();
});
