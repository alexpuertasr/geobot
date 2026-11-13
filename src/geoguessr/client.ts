import type { ClientContext } from "./core/context";
import { HttpClient } from "./core/http/http-client";
import { WebClientIdentity } from "./core/identity";
import { Lifetime } from "./core/lifetime";
import { NotificationSocket } from "./core/notification-socket";
import {
  type GeoGuessrOptions,
  type ResolvedOptions,
  resolveOptions,
} from "./options";
import { Parties } from "./resources/party/parties";

/**
 * The GeoGuessr SDK. Creating it does no I/O; sockets open when a party or a
 * game needs one, and `close()` — or `await using` — shuts them all.
 *
 * ```ts
 * await using geoguessr = new GeoGuessr();
 *
 * const party = await geoguessr.parties.current();
 * const game = await party?.startGame();
 * ```
 */
export class GeoGuessr implements AsyncDisposable {
  readonly parties: Parties;

  readonly #context: ClientContext;

  constructor(options?: GeoGuessrOptions) {
    this.#context = createContext(resolveOptions(options));
    this.parties = new Parties(this.#context);
  }

  /**
   * Closes every party and game handle and the sockets behind them, waiting
   * for each to close cleanly so nothing is left half-open when a Lambda
   * freezes. Idempotent.
   */
  close(): Promise<void> {
    return this.#context.lifetime.close(this.#context.notifications);
  }

  [Symbol.asyncDispose]() {
    return this.close();
  }
}

const createContext = (options: ResolvedOptions): ClientContext => {
  const { logger, baseUrls } = options;
  const identity = new WebClientIdentity(options.cookies);

  return {
    identity,
    http: new HttpClient(identity, options),
    notifications: new NotificationSocket({
      url: baseUrls.notificationSocket,
      identity,
      logger,
    }),
    lifetime: new Lifetime(logger),
    logger,
    baseUrls,
  };
};
