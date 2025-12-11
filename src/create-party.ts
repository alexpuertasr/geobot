import { Resource } from "sst";
import { WebClient } from "@slack/web-api";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { parseCookies } from "./parse-cookies";

const slack = new WebClient(Resource.SlackBotToken.value);

export const handler = async () => {
  try {
    console.log("🚀 Geobot started at:", new Date().toISOString());

    const executablePath = process.env.SST_DEV
      ? process.env.YOUR_LOCAL_CHROMIUM_PATH
      : await chromium.executablePath();

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();

    const cookies = parseCookies(Resource.GeoguessrCookies.value);
    const context = browser.defaultBrowserContext();
    await context.setCookie(...cookies);

    await page.goto("https://www.geoguessr.com/party");

    await page.waitForSelector('input[name="copy-link"]');
    const partyLink = await page.$eval(
      'input[name="copy-link"]',
      (input: HTMLInputElement) => input.value
    );

    const result = await slack.chat.postMessage({
      channel: Resource.SlackChannel.value,
      text: `<!here> time to guess!\n:geoguessr: ${partyLink}\n:google_meet: ${Resource.GoogleMeetsLink.value}\n\n🚧 I'm still under development, please previous winner manage the session 🏆⚙️`,
    });

    if (result.ok) {
      console.log(`✅ Slack message sent successfully`);
    } else {
      console.error(`❌ Slack API error:`, result.error || "Unknown error");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Success" }),
    };
  } catch (error) {
    console.error(`💥 Failed to create party:`, error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to execute" }),
    };
  }
};
