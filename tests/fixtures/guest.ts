import {
  type BrowserContext,
  test as base,
  expect,
  type Page,
} from "@playwright/test";

export type Guest = {
  name: string;
  page: Page;
  makeGuess: () => Promise<void>;
};

export type GuestFixture = {
  create: (name: string, joinCode: string) => Promise<Guest>;
};

export const test = base.extend<{ guest: GuestFixture }>({
  guest: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];

    await use({
      create: async (name, joinCode) => {
        const guestContext = await browser.newContext();
        contexts.push(guestContext);

        const guestPage = await guestContext.newPage();

        await guestPage.goto(
          `https://www.geoguessr.com/join/${joinCode}?s=Url`,
        );

        await guestPage.getByTestId("guest-nick-input").fill(name);
        await guestPage.getByTestId("join-party-button").click();

        return {
          name,
          page: guestPage,
          makeGuess: async () => {
            const map = guestPage.getByTestId("guess-map");

            await map.hover();
            await guestPage.waitForTimeout(500);
            const box = await map.boundingBox();

            if (!box) {
              throw new Error("Guess map is not visible");
            }

            await guestPage.mouse.click(
              box.x + box.width * (0.25 + Math.random() * 0.5),
              box.y + box.height * (0.25 + Math.random() * 0.5),
            );

            await expect(guestPage.getByTestId("perform-guess")).toBeEnabled();
          },
        };
      },
    });

    for (const guestContext of contexts) {
      await guestContext.close();
    }
  },
});
