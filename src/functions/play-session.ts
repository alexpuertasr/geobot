import { WebClient } from "@slack/web-api";
import chromium from "@sparticuz/chromium";
import type { Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import { Resource } from "sst";

import { parseCookies } from "../parse-cookies";
import { partyEvent, partyEventPayload } from "./schemas/party-events";
import { type SessionEvent, sessionEvent } from "./schemas/session-event";
import { EventEmitter } from "node:events";

const slack = new WebClient(Resource.SlackBotToken.value);

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

  const announce = async (text: string) => {
    if (!channel) return;
    await slack.chat.postMessage({ channel, text });
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
    const client = await page.createCDPSession();
    const socketUrls = new Map<string, string>();
    const eventEmitter = new EventEmitter();

    await client.send("Network.enable");

    client.on("Network.webSocketCreated", ({ requestId, url }) => {
      socketUrls.set(requestId, url);
    });

    client.on("Network.webSocketFrameReceived", ({ requestId, response }) => {
      const url = socketUrls.get(requestId) ?? "";

      if (url.includes("api.geoguessr.com")) {
        try {
          const event = partyEvent.parse(JSON.parse(response.payloadData));
          const payload = partyEventPayload.parse(JSON.parse(event.payload));
          eventEmitter.emit(event.code, { ...event, payload });
        } catch {
          return;
        }
      }

      if (url.includes("game-server.geoguessr.com")) {
        try {
          const event = sessionEvent.parse(JSON.parse(response.payloadData));
          eventEmitter.emit(event.code, event);
        } catch {
          return;
        }
      }
    });

    const cookies = parseCookies(Resource.GeoguessrCookies.value);
    const context = browser.defaultBrowserContext();
    await context.setCookie(...cookies);

    await page.goto("https://www.geoguessr.com/party");

    await new Promise<void>((resolve) => {
      let finished = false;
      let finishTimeout: ReturnType<typeof setTimeout>;

      eventEmitter.on("PartyMemberListUpdated", () => {
        void clickButton(page, "Start game");
      });

      eventEmitter.on("LiveChallengeRoundStarted", (event: SessionEvent) => {
        const state = event.liveChallenge?.state;
        if (!state) return;

        void notify(
          `🎮 Round ${state.currentRoundNumber} of ${state.roundCount} started!`,
        );
      });

      eventEmitter.on("LiveChallengeRoundEnded", async () => {
        await sleep(8000);
        void clickButton(page, "Start next round");
      });

      eventEmitter.on(
        "LiveChallengeLeaderboardUpdate",
        async (event: SessionEvent) => {
          if (!finished) return;

          const entries = event.liveChallenge?.leaderboards?.game?.entries;
          if (!entries?.length) return;

          const standings = [...entries]
            .sort((a, b) => a.position - b.position)
            .map((entry) => `${entry.position}. ${entry.name} — ${entry.score}`)
            .join("\n");

          await announce(`🏁 Final scores:\n${standings}`);

          clearTimeout(finishTimeout);
          resolve();
        },
      );

      eventEmitter.on("LiveChallengeFinished", (event: SessionEvent) => {
        if (event.liveChallenge?.state) {
          void notify(
            `🏁 All ${event.liveChallenge.state.currentRoundNumber} rounds finished. GG!`,
          );
        }

        finished = true;
        finishTimeout = setTimeout(resolve, 60000);
      });
    });

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
