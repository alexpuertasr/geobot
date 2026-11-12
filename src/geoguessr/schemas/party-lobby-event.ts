import * as z from "zod";

import { member } from "./entities/member";
import { party } from "./entities/party";

export type PartyLobbyEvent = z.infer<typeof partyLobbyEvent>;

export type PartyLobbyEventOf<Code extends PartyLobbyEvent["code"]> =
  PartyLobbyEvent & { code: Code };

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

const frame = z.object({ topic: z.string(), timestamp: z.string() });

export const partyLobbyEvent = z.discriminatedUnion("code", [
  frame.extend({
    code: z.literal("PartyMemberListUpdated"),
    payload: jsonPayload(
      z.object({
        partyId: z.string(),
        totalCount: z.number(),
        members: z.array(member),
      }),
    ),
  }),
  frame.extend({
    code: z.enum(["PartyUpdated", "PartyDisbanded"]),
    payload: jsonPayload(party),
  }),
  frame.extend({
    code: z.literal("PartyGameStarted"),
    payload: jsonPayload(
      z.object({
        partyId: z.string(),
        gameId: z.string(),
        lobbyId: z.string(),
        gameType: z.string(),
        nodeId: z.string(),
        players: z.array(z.string()),
      }),
    ),
  }),
  frame.extend({
    code: z.literal("PartyHostEditingSettings"),
    payload: jsonPayload(
      z.object({
        partyId: z.string(),
        settingKey: z.string(),
        isEditing: z.boolean(),
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
