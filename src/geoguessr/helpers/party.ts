import type { Member } from "@/geoguessr/schemas/member";
import type { Party } from "@/geoguessr/schemas/party";

/**
 * Whether the party has a game running or anyone besides the host connected.
 * The host is excluded by id: its own presence flag only reflects whether a
 * bot lambda currently holds a party lobby socket.
 */
export const isPartyInUse = (party: Party, members: Member[]) =>
  party.gameState === "Ongoing" ||
  members.some(
    (member) => member.isPresent && member.userId !== party.owner.userId,
  );

/**
 * The link players open to join the party. `j=3` is what GeoGuessr's own share
 * button appends; it lands guests on the join page with the nickname prompt.
 */
export const getPartyJoinLink = (party: { joinCode: { code: string } }) =>
  `https://www.geoguessr.com/join/${party.joinCode.code}?j=3`;
