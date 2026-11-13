import * as z from "zod";

import { lenientEnum } from "./lenient";

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardEntrySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    position: z.number(),
    score: z.number(),
  })
  .loose();

export type Leaderboards = z.infer<typeof leaderboardsSchema>;

export const leaderboardsSchema = z
  .object({
    game: z
      .object({ entries: z.array(leaderboardEntrySchema) })
      .loose()
      .nullish(),
    round: z
      .object({
        roundNumber: z.number(),
        entries: z.array(leaderboardEntrySchema),
      })
      .loose()
      .nullish(),
  })
  .loose();

export type RoundData = z.infer<typeof roundSchema>;

export const roundSchema = z
  .object({
    roundNumber: z.number(),
    state: lenientEnum<"Starting" | "Ongoing" | "Ended">(),
    startTime: z.string().nullish(),
    endTime: z.string().nullish(),
  })
  .loose();

export type LiveChallengeState = z.infer<typeof liveChallengeStateSchema>;

/**
 * Carried by game frames and returned by the game-state and advance-round
 * endpoints. `version` only grows: an older state is stale.
 */
export const liveChallengeStateSchema = z
  .object({
    gameId: z.string(),
    status: lenientEnum<"Ongoing" | "Finished">(),
    version: z.number(),
    currentRoundNumber: z.number(),
    roundCount: z.number(),
    rounds: z.array(roundSchema),
  })
  .loose();
