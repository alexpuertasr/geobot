import * as z from "zod";

export type NotificationFrame = z.infer<typeof notificationFrameSchema>;

export const notificationFrameSchema = z
  .object({
    code: z.string(),
    topic: z.string().nullish(),
    payload: z.unknown().optional(),
    timestamp: z.string().nullish(),
  })
  .loose();

export type GameFrame = z.infer<typeof gameFrameSchema>;

/** All game frames share one envelope; other game modes' fields are `null`. */
export const gameFrameSchema = z
  .object({
    code: z.string(),
    gameId: z.string().nullish(),
    playerId: z.string().nullish(),
    timestamp: z.string().nullish(),
    liveChallenge: z
      .object({
        state: z.unknown().optional(),
        leaderboards: z.unknown().optional(),
      })
      .loose()
      .nullish(),
  })
  .loose();
