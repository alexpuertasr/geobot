import { WebClient } from "@slack/web-api";
import chromium from "@sparticuz/chromium";
import type { Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import { Resource } from "sst";

import { parseCookies } from "./parse-cookies";

const slack = new WebClient(Resource.SlackBotToken.value);

const TOTAL_ROUNDS = 5;
const ROUND_DURATION_MS = 100000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickButton(page: Page, label: string, timeout = 60000) {
  await page.waitForFunction(
    (text: string) =>
      Array.from(document.querySelectorAll("button")).some(
        (button) =>
          button.textContent?.trim().includes(text) && !button.disabled,
      ),
    { timeout },
    label,
  );

  await page.evaluate((text: string) => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) =>
        candidate.textContent?.trim().includes(text) && !candidate.disabled,
    );
    button?.click();
  }, label);
}

type PlaySessionEvent = {
  channel?: string;
  threadTs?: string;
};

export const handler = async (event: PlaySessionEvent = {}) => {
  const { channel, threadTs } = event;

  const notify = async (text: string) => {
    if (!channel) return;
    await slack.chat.postMessage({ channel, thread_ts: threadTs, text });
  };

  try {
    console.log("🎮 Play session started at:", new Date().toISOString());

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

    await clickButton(page, "Start game");
    await notify(`🎮 Round 1 of ${TOTAL_ROUNDS} started!`);

    for (let round = 2; round <= TOTAL_ROUNDS; round++) {
      await sleep(ROUND_DURATION_MS);
      await clickButton(page, "Start next round");
      await notify(`🎮 Round ${round} of ${TOTAL_ROUNDS} started!`);
    }

    await sleep(ROUND_DURATION_MS);

    await notify(`🏁 All ${TOTAL_ROUNDS} rounds finished. GG!`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Success" }),
    };
  } catch (error) {
    console.error("💥 Failed to play session:", error);
    await notify("⚠️ Something went wrong while running the session.");

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to execute" }),
    };
  }
};
