import { test as base, expect, type Page } from "@playwright/test";
import { Resource } from "sst";

import { minimalInitialProps } from "../../src/functions/schemas/initial-props";
import { parseCookies } from "../../src/parse-cookies";

export type GameSettings = {
  roundCount?: number;
  roundTime?: number;
};

export type Party = {
  partyId: string;
  joinCode: string;
  gameSettings: {
    roundCount: number;
    roundTime: number;
  };
};

export type Owner = {
  page: Page;
  createParty: (settings?: GameSettings) => Promise<Party>;
};

const parseParty = async (page: Page) => {
  const nextData = await page.locator("#__NEXT_DATA__").textContent();
  const initialProps = JSON.parse(nextData ?? "");

  return minimalInitialProps.parse(initialProps).props.pageProps.party;
};

const setSlider = async (page: Page, label: string, value: number) => {
  const wrapper = page
    .locator('[class*="slider-option_wrapper"]')
    .filter({ has: page.getByText(label, { exact: true }) });

  const input = wrapper.locator("input");
  await input.fill(String(value));
  await input.press("Enter");

  await expect(wrapper.locator("[aria-valuenow]")).toHaveAttribute(
    "aria-valuenow",
    String(value),
  );
};

export const test = base.extend<{ owner: Owner }>({
  owner: async ({ context, page }, use) => {
    const cookies = parseCookies(Resource.GeoguessrCookies.value);

    await context.addCookies(
      cookies.map((cookie) => ({
        ...cookie,
        path: "/",
        secure: true,
      })),
    );

    await use({
      page,
      createParty: async (settings) => {
        await page.goto("https://www.geoguessr.com/party");

        await page.getByTestId("disband-party-button").click();
        await page.getByTestId("confirmation-dialog-continue").click();

        await page.goto("https://www.geoguessr.com/party");

        if (settings) {
          await page.getByTestId("party-settings-button").click();

          if (settings.roundTime !== undefined) {
            await setSlider(page, "Round time", settings.roundTime);
          }

          if (settings.roundCount !== undefined) {
            await setSlider(page, "Number of rounds", settings.roundCount);
          }

          await page.getByTestId("close-button").click();
          await page.reload();
        }

        const party = await parseParty(page);

        if (settings?.roundTime !== undefined) {
          expect(party.gameSettings.roundTime).toBe(settings.roundTime);
        }

        if (settings?.roundCount !== undefined) {
          expect(party.gameSettings.roundCount).toBe(settings.roundCount);
        }

        return {
          partyId: party.partyId,
          joinCode: party.joinCode.code,
          gameSettings: party.gameSettings,
        };
      },
    });

    const cleanupPage = await context.newPage();
    await cleanupPage.goto("https://www.geoguessr.com/party");

    const disbandButton = cleanupPage.getByTestId("disband-party-button");

    if (
      await disbandButton
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false)
    ) {
      await disbandButton.click();
      await cleanupPage.getByTestId("confirmation-dialog-continue").click();
      await expect(cleanupPage).toHaveURL("https://www.geoguessr.com/");
    }

    await cleanupPage.close();
  },
});
