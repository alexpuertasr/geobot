import * as z from "zod";

import type { ClientContext } from "../../core/context";
import { AuthenticationError, GeoGuessrError } from "../../errors";
import { routes } from "../../protocol/routes";
import {
  type CreatePartyOptions,
  createPartyRequestSchema,
  type MemberData,
  type PartyData,
  partyShape,
} from "../../protocol/schemas/party";

import { readMembers } from "./members";
import { Party } from "./party";
import { readPartyPage } from "./party-page";

/** `geoguessr.parties`: finding and creating the account's party. */
export class Parties {
  readonly #context: ClientContext;

  /** @internal */
  constructor(context: ClientContext) {
    this.#context = context;
  }

  /**
   * The party the account owns, or `null`. Read like the web client's party
   * page reads it — the server-rendered page also carries the members and
   * the client build id — falling back to the JSON API if it can't be read.
   *
   * @throws {AuthenticationError} the session is signed out.
   */
  async current(): Promise<Party | null> {
    const { lifetime, http, identity, reader } = this.#context;
    lifetime.assertOpen();

    const response = await http.request(routes.partyPage());
    const page = readPartyPage(response.body, this.#context);
    if (!page) return this.#currentFromApi();

    if (page.buildId) identity.clientVersion = `web-${page.buildId}`;
    if (page.signedOut) throw signedOut(response.url);
    // The page says "no party" by leaving the field out, which a rename of
    // it would look like too: the API settles it.
    if (page.party == null) return this.#currentFromApi();

    const data = reader.read(partyShape, page.party);
    if (!data) return this.#currentFromApi();

    return this.#toParty(data, readMembers(reader, page.memberList));
  }

  /**
   * Creates a party (defaults: Live Challenge, World, 5 rounds of 90s). An
   * account owns at most one: disband the current one first.
   */
  async create(options?: CreatePartyOptions): Promise<Party> {
    const { lifetime, http, logger } = this.#context;
    lifetime.assertOpen();

    const data = await http.json(partyShape, routes.createParty(), {
      body: validated(options),
    });
    logger.info("🎉 Party created", { partyId: data.partyId });
    return this.#toParty(data, [data.owner]);
  }

  /** The fallback when the page can't be read; the API has no member list. */
  async #currentFromApi(): Promise<Party | null> {
    const { http } = this.#context;
    const response = await http.request(routes.activeParty());
    if (response.status === 204 || !response.body) return null;

    return this.#toParty(http.parse(partyShape, response), null);
  }

  #toParty(data: PartyData, members: MemberData[] | null) {
    return new Party({ data, members, context: this.#context });
  }
}

const validated = (options: CreatePartyOptions | undefined) => {
  const result = createPartyRequestSchema.safeParse(options);
  if (result.success) return result.data;

  throw new GeoGuessrError(
    `Invalid party options: ${z.prettifyError(result.error)}`,
  );
};

const signedOut = (url: string) =>
  new AuthenticationError({
    status: 401,
    method: "GET",
    url,
    body: null,
    message:
      "GeoGuessr says the session is signed out: refresh the GeoguessrCookies secret",
  });
