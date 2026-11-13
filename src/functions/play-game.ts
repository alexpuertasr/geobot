import { WebClient } from "@slack/web-api";
import type { Handler } from "aws-lambda";
import { Resource } from "sst";

import {
  GeoGuessr,
  type LeaderboardEntry,
  NotEnoughPlayersError,
} from "@/geoguessr";
import { logger } from "@/logger";

const slack = new WebClient(Resource.SlackBotToken.value);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Lambda time kept spare on top of the game's estimated duration. */
const SAFETY_BUFFER_MS = 60_000;
/** Stop waiting this long before the Lambda would be killed, to say so. */
const SHUTDOWN_MARGIN_MS = 10_000;

export type PlayGameEvent = {
  trigger?: "slack" | "tests";
  channel?: string;
  threadTs?: string;
};

const formatStandings = (standings: readonly LeaderboardEntry[]) =>
  standings
    .map((entry) => `${entry.position}. ${entry.name} — ${entry.score}`)
    .join("\n");

export const handler: Handler<PlayGameEvent, void> = async (event, context) => {
  const { channel, threadTs } = event;

  const roundTransitionMs = event.trigger === "tests" ? 2_000 : 8_000;

  logger.addContext(context);
  logger.appendPersistentKeys({ trigger: event.trigger ?? "unknown" });

  // Slack being down must not stop a game people are playing: log and move on.
  const post = async (text: string, thread?: string) => {
    if (!channel) return;
    try {
      await slack.chat.postMessage({ channel, thread_ts: thread, text });
    } catch (error) {
      logger.error("💬 Could not post to Slack", { text, error });
    }
  };
  const notify = (text: string) => post(text, threadTs);
  const announce = (text: string) => post(text);

  try {
    await using geoguessr = new GeoGuessr();

    const party = await geoguessr.parties.current();

    if (!party || party.isExpired) {
      await notify("⚠️ I could not find the party to start the game.");
      return;
    }

    const { roundCount, roundTime } = party.gameSettings;
    const estimatedMs =
      party.estimateGameDuration({ roundTransitionMs }) + SAFETY_BUFFER_MS;
    const remainingMs = context.getRemainingTimeInMillis();

    if (estimatedMs > remainingMs) {
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

    const game = await party.startGame();

    game.on("roundStarted", ({ round, roundCount }) =>
      notify(`🎮 Round ${round} of ${roundCount} started!`),
    );

    game.on("roundEnded", async ({ isLastRound }) => {
      if (isLastRound) return;
      await sleep(roundTransitionMs);
      // Resolves false, without calling GeoGuessr, if the game was aborted
      // during the pause.
      await game.advanceRound();
    });

    game.on("finished", ({ state }) =>
      notify(`🏁 All ${state.roundCount} rounds finished. GG!`),
    );

    const result = await game.done({
      signal: AbortSignal.timeout(
        Math.max(0, context.getRemainingTimeInMillis() - SHUTDOWN_MARGIN_MS),
      ),
    });

    if (result.outcome === "aborted") {
      await notify(
        result.reason === "partyDisbanded"
          ? "🛑 The party was disbanded, so I've stopped running the game."
          : "🛑 The game was aborted, so I've stopped running it.",
      );
      return;
    }

    if (result.standings.length) {
      await announce(`🏁 Final scores:\n${formatStandings(result.standings)}`);
    }
  } catch (error) {
    if (error instanceof NotEnoughPlayersError) {
      await notify(
        "⚠️ I could not start the game — is at least one other player in the party?",
      );
      return;
    }

    logger.error("💥 Failed to play game", { error });
    await notify("⚠️ Something went wrong while running the game.");
  }
};
