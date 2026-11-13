import WebSocket from "ws";

import { ConnectionError } from "../../errors";
import type { SdkLogger } from "../../options";
import {
  CLOSE_INTENTIONAL,
  type CloseInfo,
  isFinalClose,
} from "../../protocol/close-codes";
import { deferred } from "../deferred";
import type { WebClientIdentity } from "../identity";
import { parseJsonOr } from "../parse";

import { Heartbeat } from "./heartbeat";

/** A server that accepts the connection but never upgrades it becomes a 1006. */
const HANDSHAKE_TIMEOUT_MS = 10_000;
/** How long `close()` waits for the closing handshake before cutting it. */
const CLOSE_TIMEOUT_MS = 1_000;
/**
 * The wait before each try since the socket was last open. Never zero: a
 * server that accepts connections and drops them straight away is retried
 * once a second, not in a tight loop.
 */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000];
/** A socket that has never opened gives up after this many tries. */
const MAX_TRIES_NEVER_OPENED = 5;

const NOT_JSON = Symbol("not JSON");

export type ReconnectingSocketOptions = {
  /** For logs and errors: `notification` or `game`. */
  name: string;
  url: string;
  identity: WebClientIdentity;
  logger: SdkLogger;
  /** Runs on every open, first or not: (re)send subscriptions here. */
  onOpen: () => void;
  onMessage: (data: unknown) => void;
  /**
   * Asked after a drop the socket could recover from, once it has opened:
   * whether to keep trying, given how long it has been down.
   */
  shouldReconnect: (downForMs: number) => boolean;
  /** Runs once if it gives up after having been connected. */
  onLost: (error: ConnectionError) => void;
};

/**
 * A WebSocket that presents itself like the web client's — its identity,
 * heartbeat and close code 4000 — reconnects after a drop, and whose
 * `close()` waits for the closing handshake: a Lambda frozen mid-close would
 * keep the connection half-open and replay its buffered frames on the next
 * thaw.
 */
export class ReconnectingSocket {
  readonly #options: ReconnectingSocketOptions;
  readonly #heartbeat = new Heartbeat();
  #socket: WebSocket | null = null;
  #firstOpen: PromiseWithResolvers<void> | null = null;
  #lost: ConnectionError | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  #wasConnected = false;
  /** Tries since the socket was last open. */
  #tries = 0;
  /** When the socket went down (`Date.now()`); 0 while it's up. */
  #downSince = 0;

  constructor(options: ReconnectingSocketOptions) {
    this.#options = options;
  }

  /** Resolves once the socket first opens; rejects once it's closed or lost. */
  connect(): Promise<void> {
    if (this.#closed) return Promise.reject(this.#closedError());
    if (this.#lost) return Promise.reject(this.#lost);

    if (!this.#firstOpen) {
      this.#firstOpen = deferred();
      this.#open();
    }
    return this.#firstOpen.promise;
  }

  /** Sends a message if the socket is open, and drops it otherwise. */
  send(message: object) {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(message));
    }
  }

  /** Closes for good. Never throws. */
  async close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#stopTimers();
    this.#firstOpen?.reject(this.#closedError());

    const socket = this.#socket;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      await this.#closeGracefully(socket);
    }
  }

  #open() {
    this.#tries += 1;
    const socket = new WebSocket(this.#url(), {
      headers: this.#options.identity.browserHeaders(),
      handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
    });
    this.#socket = socket;

    socket.on("open", () => this.#onOpen(socket));
    socket.on("message", (raw) => this.#onMessage(String(raw)));
    socket.on("unexpected-response", (_, response) =>
      this.#onHandshakeRejected(socket, response),
    );
    socket.on("error", (error) =>
      this.#options.logger.warn(`📡 ${this.#options.name} socket error`, {
        error,
      }),
    );
    socket.on("close", (code, reason) =>
      this.#onClose(socket, { code, reason: reason.toString() }),
    );
  }

  #url() {
    const { url, identity } = this.#options;
    const params = new URLSearchParams({
      ...(identity.clientVersion ? { c: identity.clientVersion } : {}),
      tabId: identity.tabId,
      attempt: String(this.#tries),
      visibility: "visible",
    });
    return `${url}?${params}`;
  }

  #onOpen(socket: WebSocket) {
    // `close()` can't stop a handshake that was already completing.
    if (this.#closed) {
      socket.terminate();
      return;
    }

    this.#options.logger.info(`📡 ${this.#options.name} socket open`);
    this.#wasConnected = true;
    this.#tries = 0;
    this.#downSince = 0;
    this.#heartbeat.start(socket, () => this.#onMissedPong(socket));
    this.#options.onOpen();
    this.#firstOpen?.resolve();
  }

  #onMessage(raw: string) {
    const data = parseJsonOr(raw, NOT_JSON);
    if (data === NOT_JSON) {
      this.#options.logger.error(`📡 ${this.#options.name} frame unparsed`, {
        payload: raw,
      });
      return;
    }
    this.#options.onMessage(data);
  }

  #onMissedPong(socket: WebSocket) {
    this.#options.logger.warn(`📡 ${this.#options.name} socket missed a pong`);
    socket.terminate();
  }

  #onHandshakeRejected(socket: WebSocket, response: { statusCode?: number }) {
    const status = response.statusCode ?? 0;
    this.#options.logger.warn(`📡 ${this.#options.name} handshake rejected`, {
      status,
    });
    socket.terminate();
    this.#onClose(socket, {
      code: status,
      reason: `handshake rejected with ${status}`,
    });
  }

  #onClose(socket: WebSocket, close: CloseInfo) {
    // A replaced socket, or a second report of the same close.
    if (socket !== this.#socket || this.#closed) return;
    this.#socket = null;
    this.#stopTimers();
    if (this.#downSince === 0) this.#downSince = Date.now();

    if (this.#canReconnect(close)) {
      this.#scheduleReconnect(close);
    } else {
      this.#giveUp(close);
    }
  }

  #canReconnect(close: CloseInfo) {
    if (isFinalClose(close)) return false;
    if (!this.#wasConnected) return this.#tries < MAX_TRIES_NEVER_OPENED;
    return this.#options.shouldReconnect(Date.now() - this.#downSince);
  }

  #scheduleReconnect(close: CloseInfo) {
    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(this.#tries, RECONNECT_DELAYS_MS.length - 1)
      ];
    this.#options.logger.warn(
      `📡 ${this.#options.name} socket closed, reconnecting in ${delay}ms`,
      { ...close, tries: this.#tries },
    );
    this.#reconnectTimer = setTimeout(() => this.#open(), delay);
  }

  #giveUp(close: CloseInfo) {
    const { name, logger, onLost } = this.#options;
    logger.warn(`📡 ${name} socket closed, not reconnecting`, { ...close });

    this.#lost = new ConnectionError(
      `The ${name} socket closed with ${close.code}${close.reason ? ` (${close.reason})` : ""}`,
      { code: close.code },
    );
    if (this.#wasConnected) onLost(this.#lost);
    this.#firstOpen?.reject(this.#lost);
  }

  async #closeGracefully(socket: WebSocket) {
    // Not `events.once`: it rejects on the `error` ws emits for a cut handshake.
    const closed = new Promise<boolean>((resolve) =>
      socket.once("close", () => resolve(true)),
    );
    const timedOut = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), CLOSE_TIMEOUT_MS).unref(),
    );

    if (socket.readyState === WebSocket.OPEN) {
      socket.close(CLOSE_INTENTIONAL);
    } else {
      socket.terminate();
    }

    if (!(await Promise.race([closed, timedOut]))) socket.terminate();
  }

  #stopTimers() {
    this.#heartbeat.stop();
    clearTimeout(this.#reconnectTimer);
  }

  #closedError() {
    return new ConnectionError(
      `The ${this.#options.name} socket was closed by the client`,
      { code: CLOSE_INTENTIONAL },
    );
  }
}
