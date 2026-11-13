import type { PayloadReader } from "../../core/payload-reader";
import {
  type MemberData,
  memberListShape,
  memberShape,
} from "../../protocol/schemas/party";

/**
 * Every member that can be read — one odd member mustn't hide the rest — or
 * `null` if there's no member list at all.
 */
export const readMembers = (
  reader: PayloadReader,
  memberList: unknown,
): MemberData[] | null => {
  const list = reader.read(memberListShape, memberList);
  if (!list) return null;

  return list.members.flatMap(
    (member) => reader.read(memberShape, member) ?? [],
  );
};
