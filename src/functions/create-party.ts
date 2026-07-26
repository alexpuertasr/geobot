import { WebClient } from "@slack/web-api";
import chromium from "@sparticuz/chromium";
import type { Context } from "aws-lambda";
import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import { Resource } from "sst";

import { logger } from "../logger";
import { parseCookies } from "../parse-cookies";

import { minimalInitialProps } from "./schemas/initial-props";

const slack = new WebClient(Resource.SlackBotToken.value);

type CreatePartyEvent = {
  trigger?: "cron" | "slack";
};

export const handler = async (
  event: CreatePartyEvent = {},
  context: Context,
) => {
  logger.addContext(context);

  logger.appendPersistentKeys({ trigger: event.trigger ?? "unknown" });

  let browser: Browser | undefined;

  try {
    const executablePath = process.env.SST_DEV
      ? process.env.YOUR_LOCAL_CHROMIUM_PATH
      : await chromium.executablePath();

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();

    const cookies = parseCookies(Resource.GeoguessrCookies.value);
    const browserContext = browser.defaultBrowserContext();
    await browserContext.setCookie(...cookies);

    await page.goto("https://www.geoguessr.com/party");

    const nextData = await page.evaluate(() => {
      return document.getElementById("__NEXT_DATA__")?.textContent ?? null;
    });

    const data: unknown = JSON.parse(nextData ?? "");
    const { party } = minimalInitialProps.parse(data).props.pageProps;

    const partyLink = `https://www.geoguessr.com/join/${party.joinCode.code}?s=Url`;
    logger.info("📄 Party link from __NEXT_DATA__", {
      partyId: party.partyId,
      partyLink,
    });

    const result = await slack.chat.postMessage({
      channel: Resource.SlackChannel.value,
      text: `<!here> time to guess!\n:geoguessr: ${partyLink}\n:google_meet: ${Resource.GoogleMeetsLink.value}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<!here> time to guess!\n:geoguessr: ${partyLink}\n:google_meet: ${Resource.GoogleMeetsLink.value}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Start once everyone is ready!",
              },
              style: "primary",
              action_id: "start_session",
            },
          ],
        },
      ],
    });

    if (result.ok) {
      logger.info(`✅ Slack message sent successfully`);
    } else {
      logger.error(`❌ Slack API error:`, { error: result.error });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Success" }),
    };
  } catch (error) {
    logger.error(`💥 Failed to create party:`, { error });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to execute" }),
    };
  } finally {
    await browser?.close();
  }
};
