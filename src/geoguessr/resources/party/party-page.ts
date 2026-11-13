import { parseJsonOr, parseOrLog } from "../../core/parse";
import type { SdkLogger } from "../../options";
import {
  type MemberData,
  memberSchema,
  partyPageSchema,
  rawMemberListSchema,
} from "../../protocol/schemas/party";

export type PartyPage = {
  /** What the web client identifies itself with. */
  buildId: string | null;
  /** The page still renders when signed out — just without a party. */
  signedOut: boolean;
  party: unknown;
  memberList: unknown;
};

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/** Reads the server-rendered `__NEXT_DATA__` of `/party`; `null` if unreadable. */
export const readPartyPage = (
  html: unknown,
  logger: SdkLogger,
): PartyPage | null => {
  const nextData = typeof html === "string" ? html.match(NEXT_DATA)?.[1] : null;
  if (!nextData) {
    logger.error("📄 No __NEXT_DATA__ on the party page");
    return null;
  }

  const page = parseOrLog(partyPageSchema, parseJsonOr(nextData, null), {
    logger,
    message: "📄 Could not read the party page",
  });
  if (!page) return null;

  const { statusCode, initialParty, initialMemberInfo } = page.props.pageProps;
  return {
    buildId: page.buildId ?? null,
    signedOut: statusCode === 401 || statusCode === 403,
    party: initialParty,
    memberList: initialMemberInfo,
  };
};

/**
 * Every member that parses — one odd member mustn't hide the rest — or
 * `null` if there's no member list at all.
 */
export const readMembers = (memberList: unknown): MemberData[] | null => {
  const list = rawMemberListSchema.safeParse(memberList);
  if (!list.success) return null;

  return list.data.members.flatMap((entry) => {
    const member = memberSchema.safeParse(entry);
    return member.success ? [member.data] : [];
  });
};
