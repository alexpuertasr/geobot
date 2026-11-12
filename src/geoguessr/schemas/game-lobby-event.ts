import * as z from "zod";

import { liveChallengeLeaderboards } from "./entities/live-challenge/leaderboards";
import { liveChallengeState } from "./entities/live-challenge/state";

export type GameLobbyEvent = z.infer<typeof gameLobbyEvent>;

export type GameLobbyEventOf<Code extends GameLobbyEvent["code"]> =
  GameLobbyEvent & { code: Code };

const frame = z.object({ gameId: z.string(), timestamp: z.string() });

export const gameLobbyEvent = z.discriminatedUnion("code", [
  frame.extend({
    code: z.enum(["ConnectionOpened", "ConnectionClosed"]),
    playerId: z.string(),
  }),
  frame.extend({
    code: z.enum([
      "LiveChallengeStarted",
      "LiveChallengeRoundEnded",
      "LiveChallengeRoundStarting",
      "LiveChallengeRoundStarted",
    ]),
    liveChallenge: z.object({ state: liveChallengeState }),
  }),
  frame.extend({
    code: z.literal("LiveChallengeLeaderboardUpdate"),
    liveChallenge: z.object({ leaderboards: liveChallengeLeaderboards }),
  }),
  frame.extend({
    code: z.literal("LiveChallengeFinished"),
    liveChallenge: z.object({
      state: liveChallengeState,
      gameBreakdownAvailableAfter: z.string(),
    }),
  }),
  frame.extend({ code: z.literal("GameAborted") }),
]);
