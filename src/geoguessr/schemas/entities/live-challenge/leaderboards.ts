import * as z from "zod";

export type LiveChallengeLeaderboardEntry = z.infer<typeof leaderboardEntry>;

const roundGuess = z.object({
  roundNumber: z.number(),
  lat: z.number(),
  lng: z.number(),
  distance: z.number(),
  score: z.number(),
  time: z.number(),
  wasCorrect: z.boolean(),
});

export const leaderboardEntry = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
  score: z.number(),
  avatarPath: z.string(),
  flair: z.number(),
  isGuest: z.boolean(),
  isVerified: z.boolean(),
});

export const liveChallengeLeaderboards = z.object({
  game: z.object({ entries: z.array(leaderboardEntry) }).nullable(),
  round: z
    .object({
      roundNumber: z.number(),
      totalGuessesOnRound: z.number(),
      entries: z.array(leaderboardEntry),
      guesses: z.array(roundGuess),
    })
    .nullable(),
  roundGuessTime: z
    .object({
      roundNumber: z.number(),
      entries: z.array(leaderboardEntry),
    })
    .nullable(),
});
