import { randomUUID } from "node:crypto";

import { GEOGUESSR_ORIGIN } from "../protocol/routes";

/**
 * Who the bot presents itself as: GeoGuessr's web client, signed in with the
 * host account's cookies. Every request and both sockets carry it.
 */
export class WebClientIdentity {
  /** Like the web client's per-tab id: one per client, sent by both sockets. */
  readonly tabId = randomUUID();
  /**
   * `web-{buildId}`, learnt from the party page: sent as `X-Client` on
   * requests and `?c=` on sockets. Optional — GeoGuessr accepts its absence.
   */
  clientVersion: string | null = null;

  readonly #cookies: string;

  constructor(cookies: string) {
    this.#cookies = cookies;
  }

  /** What a browser sends on its own, even on a WebSocket handshake. */
  browserHeaders(): Record<string, string> {
    return { cookie: this.#cookies, origin: GEOGUESSR_ORIGIN };
  }
}
