import * as z from "zod";

export type PartyLobbyEvent = z.infer<typeof partyLobbyEvent>;

const jsonPayload = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value);
      } catch {
        ctx.addIssue({ code: "custom", message: "payload is not valid JSON" });
        return z.NEVER;
      }
    })
    .pipe(schema);

export const partyLobbyEvent = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("PartyMemberListUpdated"),
    payload: jsonPayload(
      z.object({
        partyId: z.string(),
        totalCount: z.number(),
      }),
    ),
  }),
  z.object({
    code: z.literal("PartyUpdated"),
    payload: jsonPayload(
      z.object({
        partyId: z.string(),
        lobbyId: z.string().nullish(),
        gameState: z.string().nullish(),
        gameType: z.string().nullish(),
      }),
    ),
  }),
  z.object({
    code: z.literal("PartyGameStarted"),
    payload: jsonPayload(
      z.object({
        partyId: z.string(),
        gameId: z.string(),
        gameType: z.string(),
        players: z.array(z.string()),
      }),
    ),
  }),
  z.object({
    code: z.literal("StatusActivityChanged"),
    payload: jsonPayload(
      z.object({
        friendId: z.string(),
        activity: z
          .object({
            activityType: z.string(),
            timestamp: z.string(),
          })
          .nullish(),
      }),
    ),
  }),
  z.object({
    code: z.enum(["FriendCameOnline", "FriendWentOffline"]),
    payload: jsonPayload(z.object({ friendId: z.string() })),
  }),
  z.object({
    code: z.literal("Subscribed"),
    topic: z.string(),
    level: z.string(),
  }),
]);
