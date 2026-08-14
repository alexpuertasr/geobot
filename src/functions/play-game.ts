import { WebClient } from "@slack/web-api";
import type { Handler } from "aws-lambda";
import { Resource } from "sst";

import {
  createGeoClient,
  type GameLobby,
  type GameLobbyEvent,
} from "../geoguessr/client";
import { logger } from "../logger";

const slack = new WebClient(Resource.SlackBotToken.value);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ROUND_TRANSITION_MS = 8000;
const FINAL_SCORE_WAIT_MS = 30000;
const SAFETY_BUFFER_MS = 60000;

type LiveChallenge = NonNullable<GameLobbyEvent["liveChallenge"]>;
type Leaderboards = NonNullable<LiveChallenge["leaderboards"]>;

type Game = NonNullable<Leaderboards["game"]>;
type Entry = NonNullable<Game>["entries"][number];

export type PlayGameEvent = {
  trigger?: "slack" | "tests";
  channel?: string;
  threadTs?: string;
};

export const handler: Handler<PlayGameEvent, void> = async (event, context) => {
  const { channel, threadTs } = event;

  logger.addContext(context);
  logger.appendPersistentKeys({ trigger: event.trigger ?? "unknown" });

  const notify = async (text: string) => {
    if (!channel) return;
    await slack.chat.postMessage({ channel, thread_ts: threadTs, text });
  };

  const announce = async (text: string) => {
    if (!channel) return;
    await slack.chat.postMessage({ channel, text });
  };

  let gameLobby: GameLobby | null = null;

  try {
    const geoClient = await createGeoClient({
      cookies: Resource.GeoguessrCookies.value,
    });

    const party = geoClient.currentParty();

    if (!party) {
      await notify("⚠️ I could not find the party to start the game.");
      return;
    }

    const { roundCount, roundTime } = party.gameSettings;
    const remainingMs = context.getRemainingTimeInMillis();

    const estimatedMs =
      roundCount * roundTime * 1000 +
      (roundCount - 1) * ROUND_TRANSITION_MS +
      FINAL_SCORE_WAIT_MS +
      SAFETY_BUFFER_MS;

    if (roundTime <= 0 || estimatedMs > remainingMs) {
      logger.warn("⏱️ Game does not fit within lambda timeout", {
        roundCount,
        roundTime,
        estimatedMs,
        remainingMs,
      });

      await notify(
        roundTime <= 0
          ? `⏱️ Not starting the game: rounds have no time limit, so the game could outlive me.`
          : `⏱️ Not starting the game: ${roundCount} rounds of ${roundTime}s need ~${Math.ceil(estimatedMs / 60000)} min, but I only have ${Math.floor(remainingMs / 60000)} min left.`,
      );

      return;
    }

    gameLobby = await geoClient.createGameLobby();

    await new Promise<void>((resolve, reject) => {
      let latestEntries: Entry[] = [];

      if (!gameLobby) {
        reject();
        return;
      }

      gameLobby.onError(reject);

      const announceRoundStart = (event: GameLobbyEvent) => {
        const state = event.liveChallenge?.state;
        if (!state) return;

        void notify(
          `🎮 Round ${state.currentRoundNumber} of ${state.roundCount} started!`,
        );
      };

      gameLobby.on("LiveChallengeStarted", announceRoundStart);
      gameLobby.on("LiveChallengeRoundStarted", announceRoundStart);

      gameLobby.on("LiveChallengeRoundEnded", async (event) => {
        const state = event.liveChallenge?.state;
        if (state && state.currentRoundNumber >= state.roundCount) return;

        await sleep(ROUND_TRANSITION_MS);

        const toRoundNumber = (state?.currentRoundNumber ?? 0) + 1;
        await geoClient.advanceRound(toRoundNumber);
      });

      gameLobby.on("LiveChallengeLeaderboardUpdate", (event) => {
        const entries = event.liveChallenge?.leaderboards?.game?.entries;
        if (entries?.length) latestEntries = entries;
      });

      gameLobby.on("LiveChallengeFinished", (event) => {
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
        }, FINAL_SCORE_WAIT_MS);
      });
    });
  } catch (error) {
    logger.error("💥 Failed to play game", { error });
    await notify("⚠️ Something went wrong while running the game.");
  } finally {
    gameLobby?.close();
  }
};
