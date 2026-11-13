import WebSocket from "ws";

import { ConnectionLostError } from "../../errors";
import type { SdkLogger } from "../../options";
import { CLOSE_INTENTIONAL, type CloseInfo } from "../../protocol/close-codes";
import { deferred } from "../deferred";
import type { WebClientIdentity } from "../identity";
import { parseJsonOr } from "../parse";

import { reconnectDelay } from "./backoff";
import { Heartbeat } from "./heartbeat";
import { type ReconnectContext, ReconnectState } from "./reconnect-state";

/** A server that accepts the connection but never upgrades it becomes a 1006. */
const HANDSHAKE_TIMEOUT_MS = 10_000;
/** How long `close()` waits for the closing handshake before cutting it. */
const CLOSE_TIMEOUT_MS = 1_000;
/** How long a connection must stay up, frame-less, to count as healthy. */
const HEALTHY_AFTER_MS = 5_000;

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
  shouldReconnect: (context: ReconnectContext) => boolean;
  /** Runs once if it gives up after having been connected. */
  onLost: (error: ConnectionLostError) => void;
};

/**
 * A WebSocket that behaves like the web client's — its identity, heartbeat,
 * reconnect backoff and close code 4000 — and whose `close()` waits for the
 * closing handshake: a Lambda frozen mid-close would keep the connection
 * half-open and replay its buffered frames on the next thaw.
 */
export class ReconnectingSocket {
  readonly #options: ReconnectingSocketOptions;
  readonly #state = new ReconnectState();
  readonly #heartbeat = new Heartbeat();
  #socket: WebSocket | null = null;
  #firstOpen: PromiseWithResolvers<void> | null = null;
  #lost: ConnectionLostError | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #healthyTimer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;

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
    const socket = new WebSocket(this.#nextUrl(), {
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

  #nextUrl() {
    const { url, identity } = this.#options;
    const { attempt, afterRestart } = this.#state.beginAttempt();

    const params = new URLSearchParams({
      ...(identity.clientVersion ? { c: identity.clientVersion } : {}),
      tabId: identity.tabId,
      attempt: String(attempt),
      visibility: "visible",
      ...(afterRestart ? { reconnect: "true" } : {}),
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
    this.#state.markOpened();
    this.#healthyTimer = setTimeout(
      () => this.#state.markHealthy(),
      HEALTHY_AFTER_MS,
    );
    this.#heartbeat.start(socket, () => this.#onMissedPong(socket));
    this.#options.onOpen();
    this.#firstOpen?.resolve();
  }

  #onMessage(raw: string) {
    this.#state.markHealthy();

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

    const context = this.#state.recordDrop(close);
    if (this.#options.shouldReconnect(context)) {
      this.#scheduleReconnect(context);
    } else {
      this.#giveUp(context);
    }
  }

  #scheduleReconnect({ close, attempt }: ReconnectContext) {
    const delay = reconnectDelay(attempt);
    this.#options.logger.warn(
      `📡 ${this.#options.name} socket closed, reconnecting in ${delay}ms`,
      { ...close, attempt },
    );
    this.#reconnectTimer = setTimeout(() => this.#open(), delay);
  }

  #giveUp({ close, wasConnected }: ReconnectContext) {
    const { name, logger, onLost } = this.#options;
    logger.warn(`📡 ${name} socket closed, not reconnecting`, { ...close });

    this.#lost = new ConnectionLostError({ socket: name, ...close });
    if (wasConnected) onLost(this.#lost);
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
    clearTimeout(this.#healthyTimer);
    clearTimeout(this.#reconnectTimer);
  }

  #closedError() {
    return new ConnectionLostError({
      socket: this.#options.name,
      code: CLOSE_INTENTIONAL,
      reason: "closed by the client",
    });
  }
}
