import type * as z from "zod";

import { parseOrLog } from "../../core/parse";
import type { SdkLogger } from "../../options";
import type { NotificationFrame } from "../../protocol/schemas/frames";
import {
  gameStartedSchema,
  type MemberData,
  memberListSchema,
  type PartyData,
  partySchema,
} from "../../protocol/schemas/party";

export type PartyEvents = {
  /** Settings, state or attached game changed. */
  updated: { party: PartyData };
  membersUpdated: { members: MemberData[] };
  gameStarted: { gameId: string; playerIds: string[] };
  disbanded: Record<string, never>;
};

export type PartyEvent = {
  [Type in keyof PartyEvents]: { type: Type; payload: PartyEvents[Type] };
}[keyof PartyEvents];

/** What a party frame means, or `null` if it changes nothing we follow. */
export const readPartyFrame = (
  frame: NotificationFrame,
  logger: SdkLogger,
): PartyEvent | null => {
  const read = <Schema extends z.ZodType>(schema: Schema) =>
    parseOrLog(schema, frame.payload, {
      logger,
      message: `🛰️ [Party] Failed to parse ${frame.code}`,
    });

  switch (frame.code) {
    case "PartyUpdated":
      return updated(read(partySchema));
    case "PartyMemberListUpdated":
      return membersUpdated(read(memberListSchema));
    case "PartyGameStarted":
      return gameStarted(read(gameStartedSchema));
    case "PartyDisbanded":
      return { type: "disbanded", payload: {} };
    default:
      return null;
  }
};

const updated = (party: PartyData | null): PartyEvent | null =>
  party && { type: "updated", payload: { party } };

/** Ignores empty lists, like the web client: the bot is always a member. */
const membersUpdated = (
  list: z.infer<typeof memberListSchema> | null,
): PartyEvent | null =>
  list?.members.length
    ? { type: "membersUpdated", payload: { members: list.members } }
    : null;

const gameStarted = (
  started: z.infer<typeof gameStartedSchema> | null,
): PartyEvent | null =>
  started && {
    type: "gameStarted",
    payload: { gameId: started.lobbyId, playerIds: started.players ?? [] },
  };
