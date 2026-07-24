import { EventEmitter } from "node:events";

import { WebClient } from "@slack/web-api";
import chromium from "@sparticuz/chromium";
import type { Context } from "aws-lambda";
import type { Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import { Resource } from "sst";
import * as z from "zod";

import { logger } from "../logger";
import { parseCookies } from "../parse-cookies";

import { partyEvent, partyEventPayload } from "./schemas/party-events";
import { type SessionEvent, sessionEvent } from "./schemas/session-event";

const slack = new WebClient(Resource.SlackBotToken.value);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickButton(page: Page, label: string, timeout = 60000) {
  try {
    await page.locator(`button::-p-text(${label})`).setTimeout(timeout).click();
    logger.info(`🖱️ clicked "${label}"`);
    return true;
  } catch {
    logger.warn(`⚠️ never clicked "${label}" within ${timeout}ms`, {
      url: page.url(),
    });

    return false;
  }
}

type LiveChallenge = NonNullable<SessionEvent["liveChallenge"]>;
type Leaderboards = NonNullable<LiveChallenge["leaderboards"]>;

type Game = NonNullable<Leaderboards["game"]>;
type Entry = NonNullable<Game>["entries"][number];

type PlaySessionEvent = {
  channel?: string;
  threadTs?: string;
};

export const handler = async (
  event: PlaySessionEvent = {},
  context: Context,
) => {
  const { channel, threadTs } = event;

  logger.addContext(context);

  const notify = async (text: string) => {
    if (!channel) return;
    await slack.chat.postMessage({ channel, thread_ts: threadTs, text });
  };

  const announce = async (text: string) => {
    if (!channel) return;
    await slack.chat.postMessage({ channel, text });
  };

  try {
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
    const unknownSockets = new Set<string>();
    const eventEmitter = new EventEmitter();

    const safeEmit = (code: string, event: unknown) => {
      try {
        eventEmitter.emit(code, event);
      } catch (error) {
        logger.error(`💥 Listener failed handling ${code}`, { error });
      }
    };

    await client.send("Network.enable");

    client.on("Network.webSocketCreated", ({ requestId, url }) => {
      socketUrls.set(requestId, url);
      logger.info("📡 WebSocket created", { url });
    });

    client.on("Network.webSocketClosed", ({ requestId }) => {
      const url = socketUrls.get(requestId) ?? "";
      if (url.includes("geoguessr.com")) {
        logger.warn("📡 WebSocket closed", { url });
      }
    });

    client.on("Network.webSocketFrameError", ({ requestId, errorMessage }) => {
      const url = socketUrls.get(requestId) ?? "";
      if (url.includes("geoguessr.com")) {
        logger.warn("📡 WebSocket frame error", { url, errorMessage });
      }
    });

    client.on("Network.webSocketFrameReceived", ({ requestId, response }) => {
      const url = socketUrls.get(requestId) ?? "";
      if (!url.includes("geoguessr.com")) return;

      const knownSocket =
        url.includes("api.geoguessr.com") ||
        url.includes("game-server.geoguessr.com");

      let data: unknown;
      try {
        data = JSON.parse(response.payloadData);

        if (!knownSocket) {
          if (!unknownSockets.has(url)) {
            unknownSockets.add(url);
            logger.warn("📡 WebSocket frame from unknown socket", {
              url,
              data,
            });
          }

          return;
        }
      } catch (error) {
        logger.error("📡 WebSocket frame unparsed", {
          url,
          stage: "json",
          reason: error instanceof Error ? error.message : String(error),
          payload: response.payloadData,
          opcode: response.opcode,
          mask: response.mask,
        });

        return;
      }

      if (url.includes("api.geoguessr.com")) {
        try {
          const event = partyEvent.parse(data);
          const payload = partyEventPayload.parse(JSON.parse(event.payload));
          logger.info(`🛰️ ${event.code} emitted`, { data });
          safeEmit(event.code, { ...event, payload });
        } catch (error) {
          logger.error(`🛰️ Failed to parse party event`, {
            data,
            reason:
              error instanceof z.ZodError
                ? z.prettifyError(error)
                : String(error),
          });

          return;
        }
      }

      if (url.includes("game-server.geoguessr.com")) {
        try {
          const event = sessionEvent.parse(data);
          logger.info(`🛰️ ${event.code} emitted`, { data });
          safeEmit(event.code, event);
        } catch (error) {
          logger.error(`🛰️ Failed to parse session event`, {
            data,
            reason:
              error instanceof z.ZodError
                ? z.prettifyError(error)
                : String(error),
          });

          return;
        }
      }
    });

    const cookies = parseCookies(Resource.GeoguessrCookies.value);
    const context = browser.defaultBrowserContext();
    await context.setCookie(...cookies);

    await page.goto("https://www.geoguessr.com/party");
    await clickButton(page, "Start game");

    await new Promise<void>((resolve) => {
      let latestEntries: Entry[] = [];

      const announceRoundStart = (event: SessionEvent) => {
        const state = event.liveChallenge?.state;
        if (!state) return;

        void notify(
          `🎮 Round ${state.currentRoundNumber} of ${state.roundCount} started!`,
        );
      };

      eventEmitter.on("LiveChallengeStarted", announceRoundStart);
      eventEmitter.on("LiveChallengeRoundStarted", announceRoundStart);

      eventEmitter.on("LiveChallengeRoundEnded", async () => {
        await sleep(8000);

        await clickButton(page, "Start next round");
      });

      eventEmitter.on(
        "LiveChallengeLeaderboardUpdate",
        (event: SessionEvent) => {
          const entries = event.liveChallenge?.leaderboards?.game?.entries;
          if (entries?.length) latestEntries = entries;
        },
      );

      eventEmitter.on("LiveChallengeFinished", (event: SessionEvent) => {
        if (event.liveChallenge?.state) {
          void notify(
            `🏁 All ${event.liveChallenge.state.currentRoundNumber} rounds finished. GG!`,
          );
        }

        setTimeout(async () => {
          if (latestEntries.length) {
            const standings = [...latestEntries]
              .sort((a, b) => a.position - b.position)
              .map((entry) => {
                return `${entry.position}. ${entry.name} — ${entry.score}`;
              })
              .join("\n");

            await announce(`🏁 Final scores:\n${standings}`);
          }

          resolve();
        }, 30000);
      });
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Success" }),
    };
  } catch (error) {
    logger.error("💥 Failed to play session", { error });
    await notify("⚠️ Something went wrong while running the session.");

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to execute" }),
    };
  }
};
