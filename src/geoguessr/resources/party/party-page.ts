import { parseJsonOr } from "../../core/parse";
import type { PayloadReader } from "../../core/payload-reader";
import type { SdkLogger } from "../../options";
import { partyPageShape } from "../../protocol/schemas/party";

export type PartyPage = {
  /** What the web client identifies itself with. */
  buildId: string | null;
  /** The page still renders when signed out — just without a party. */
  signedOut: boolean;
  /** `undefined` when there's no party: the page then leaves the field out. */
  party: unknown;
  memberList: unknown;
};

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/** Reads the server-rendered `__NEXT_DATA__` of `/party`; `null` if unreadable. */
export const readPartyPage = (
  html: unknown,
  { reader, logger }: { reader: PayloadReader; logger: SdkLogger },
): PartyPage | null => {
  const nextData = typeof html === "string" ? html.match(NEXT_DATA)?.[1] : null;
  if (!nextData) {
    logger.error("📄 No __NEXT_DATA__ on the party page");
    return null;
  }

  const page = reader.read(partyPageShape, parseJsonOr(nextData, null));
  if (!page) return null;

  const { pageProps } = page.props;
  // The HTTP log only keeps the start of the HTML.
  logger.info("📄 Party page", { buildId: page.buildId, pageProps });

  return {
    buildId: page.buildId ?? null,
    signedOut: pageProps.statusCode === 401 || pageProps.statusCode === 403,
    party: pageProps.initialParty,
    memberList: pageProps.initialMemberInfo,
  };
};
