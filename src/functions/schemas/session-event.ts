import * as z from "zod";

export type SessionEvent = z.infer<typeof sessionEvent>;

export const sessionEvent = z.object({
  code: z.enum([
    "ConnectionOpened",
    "LiveChallengeStarted",
    "LiveChallengeRoundEnded",
    "LiveChallengeRoundStarting",
    "LiveChallengeRoundStarted",
    "LiveChallengeLeaderboardUpdate",
    "LiveChallengeFinished",
  ]),
  liveChallenge: z
    .object({
      state: z
        .object({
          currentRoundNumber: z.number(),
          roundCount: z.number(),
        })
        .nullable(),
    })
    .nullish(),
});
