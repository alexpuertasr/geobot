import * as z from "zod";

export type Member = z.infer<typeof member>;

export const member = z.object({
  nick: z.string(),
  flair: z.number(),
  pin: z.string().nullish(),
  fullBodyPin: z.string().nullish(),
  userId: z.string(),
  team: z.string().nullable(),
  isGuest: z.boolean(),
  isPresent: z.boolean(),
  isPlaying: z.boolean(),
  isBenched: z.boolean(),
  isEligibleAsOwner: z.boolean(),
  victories: z.number(),
  clientType: z.string(),
  club: z.unknown(),
});
