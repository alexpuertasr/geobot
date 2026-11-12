import {
  type BrowserContext,
  test as base,
  expect,
  type Page,
} from "@playwright/test";
import { Resource } from "sst";

import { getPartyJoinLink } from "@/geoguessr/helpers/party";
import type { Party } from "@/geoguessr/schemas/entities/party";

const accounts = {
  "player-1": {
    name: "Player 1",
    get cookies() {
      return Resource.GeoguessrPlayer1Cookies.value;
    },
  },
};

export type PlayerId = keyof typeof accounts;

export type Player = {
  name: string;
  page: Page;
  makeGuess: () => Promise<void>;
};

export type PlayerFixture = {
  join: (id: PlayerId, party: Party) => Promise<Player>;
};

export const test = base.extend<{ player: PlayerFixture }>({
  player: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];

    await use({
      join: async (id, party) => {
        const account = accounts[id];

        const context = await browser.newContext();
        contexts.push(context);

        await context.addCookies(JSON.parse(account.cookies));
        await context.addInitScript(() => {
          localStorage.setItem("partyV2LowPerformancePromptAnswered", "true");
          localStorage.setItem("partyV2WhatsNewPointRushSeen", "true");
          localStorage.setItem("__GEOGUESSR_SHOW_FEEDBACK__", "false");
          localStorage.setItem("__GEOGUESSR_SOUND_ENABLED__", "false");
          localStorage.setItem(
            "__GEOGUESSR_MAP_RENDERING_TYPE__",
            JSON.stringify("RASTER"),
          );
        });

        const playerPage = await context.newPage();

        await playerPage.goto(getPartyJoinLink(party));

        return {
          name: account.name,
          page: playerPage,
          makeGuess: async () => {
            const map = playerPage.getByTestId("guess-map");

            await map.hover();
            await playerPage.waitForTimeout(500);
            const box = await map.boundingBox();

            if (!box) {
              throw new Error("Guess map is not visible");
            }

            await playerPage.mouse.click(
              box.x + box.width * (0.25 + Math.random() * 0.5),
              box.y + box.height * (0.25 + Math.random() * 0.5),
            );

            await expect(playerPage.getByTestId("perform-guess")).toBeEnabled();
          },
        };
      },
    });

    for (const context of contexts) {
      await context.close();
    }
  },
});
