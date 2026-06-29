import * as z from "zod";

export type PartyEvent = z.infer<typeof partyEvent>;

export const partyEvent = z.object({
  code: z.enum(["PartyMemberListUpdated"]),
  payload: z.string(),
});

export const partyEventPayload = z.object({
  totalCount: z.number(),
});
