import type { PayloadReader } from "../../core/payload-reader";
import type { NotificationFrame } from "../../protocol/schemas/frames";
import {
  gameStartedShape,
  hostEditingSettingsShape,
  type MemberData,
  type PartyData,
  partyShape,
} from "../../protocol/schemas/party";

import { readMembers } from "./members";

export type PartyEvents = {
  /** Settings, state or attached game changed. */
  updated: { party: PartyData };
  membersUpdated: { members: MemberData[] };
  disbanded: Record<string, never>;
};

export type PartyEvent = {
  [Type in keyof PartyEvents]: { type: Type; payload: PartyEvents[Type] };
}[keyof PartyEvents];

/** What a party frame means, or `null` if it changes nothing we follow. */
export const readPartyFrame = (
  { code, payload }: NotificationFrame,
  reader: PayloadReader,
): PartyEvent | null => {
  switch (code) {
    case "PartyUpdated":
      return updated(reader.read(partyShape, payload));
    case "PartyMemberListUpdated":
      return membersUpdated(readMembers(reader, payload));
    case "PartyDisbanded":
      reader.audit(partyShape, payload);
      return { type: "disbanded", payload: {} };
    case "PartyGameStarted":
      reader.audit(gameStartedShape, payload);
      return null;
    case "PartyHostEditingSettings":
      reader.audit(hostEditingSettingsShape, payload);
      return null;
    default:
      return null;
  }
};

const updated = (party: PartyData | null): PartyEvent | null =>
  party && { type: "updated", payload: { party } };

/** Ignores empty lists, like the web client: the bot is always a member. */
const membersUpdated = (members: MemberData[] | null): PartyEvent | null =>
  members?.length ? { type: "membersUpdated", payload: { members } } : null;
