import * as z from "zod";

export type Player = z.infer<typeof player>;

export const player = z
  .object({
    playerId: z.string(),
    nick: z.string(),
    countryCode: z.string(),
    team: z.string().nullable(),
    isGuest: z.boolean(),
    isVerified: z.boolean(),
    flair: z.number(),
    level: z.number(),
    titleTierId: z.number(),
    division: z.string(),
    performanceStreak: z.string(),
    avatarPath: z.string(),
    borderUrl: z.string().nullable(),
    avatar: z.object({ fullBodyPath: z.string() }),
    competitive: z.object({
      rating: z.number(),
      division: z.object({
        type: z.number(),
        startRating: z.number(),
        endRating: z.number(),
      }),
    }),
  })
  .partial();
