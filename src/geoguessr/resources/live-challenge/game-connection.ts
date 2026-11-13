import type { ClientContext } from "../../core/context";
import { deferred } from "../../core/deferred";
import { ReconnectingSocket } from "../../core/socket/reconnecting-socket";
import type { ConnectionError } from "../../errors";
import { messages } from "../../protocol/messages";
import { routes } from "../../protocol/routes";
import { type GameFrame, gameFrameShape } from "../../protocol/schemas/frames";

/** How long `open()` waits for the server to confirm the bot's connection. */
const CONFIRMATION_TIMEOUT_MS = 10_000;
/**
 * How long the socket may stay down before the game is given up — where the
 * web client gives a Live Challenge up on its first server restart.
 */
const RECONNECT_BUDGET_MS = 60_000;

export type GameConnectionOptions = {
  gameId: string;
  hostId: string;
  context: ClientContext;
  /** Once the game is over, the connection isn't needed any more. */
  isGameLive: () => boolean;
  onFrame: (frame: GameFrame) => void;
  onState: (state: unknown) => void;
  onLost: (error: ConnectionError) => void;
};

/**
 * The bot's seat in a game, kept like the web client keeps it: join the
 * lobby, subscribe over the game socket, and whenever the server confirms
 * the connection, re-join and re-read the state in case something was
 * missed while away.
 */
export class GameConnection {
  readonly #options: GameConnectionOptions;
  readonly #socket: ReconnectingSocket;
  readonly #confirmed = deferred<void>();
  #awaitingConfirmation = false;

  constructor(options: GameConnectionOptions) {
    const { context, isGameLive, onLost } = options;
    this.#options = options;
    this.#socket = new ReconnectingSocket({
      name: "game",
      url: context.baseUrls.gameSocket,
      identity: context.identity,
      logger: context.logger,
      onOpen: () => this.#subscribe(),
      onMessage: (data) => this.#onMessage(data),
      shouldReconnect: (downForMs) =>
        isGameLive() && downForMs < RECONNECT_BUDGET_MS,
      onLost,
    });
  }

  /** Joins, connects, and resolves once the server confirms the bot is in. */
  async open(): Promise<void> {
    await this.#join();
    if (!this.#options.isGameLive()) return;

    const fallback = setTimeout(
      () => this.#proceedUnconfirmed(),
      CONFIRMATION_TIMEOUT_MS,
    );
    try {
      await this.#socket.connect();
      await this.#confirmed.promise;
    } finally {
      clearTimeout(fallback);
    }
  }

  /** Lets a pending `open()` return, e.g. because the game ended meanwhile. */
  stopWaiting() {
    this.#confirmed.resolve();
  }

  async fetchState(): Promise<void> {
    if (!this.#options.isGameLive()) return;

    const { http, logger } = this.#options.context;
    try {
      const response = await http.request(routes.gameState(this.#gameId));
      this.#options.onState(response.body);
    } catch (error) {
      logger.warn("🎮 Could not fetch the game state", {
        gameId: this.#gameId,
        error,
      });
    }
  }

  close() {
    return this.#socket.close();
  }

  get #gameId() {
    return this.#options.gameId;
  }

  #subscribe() {
    this.#awaitingConfirmation = true;
    this.#socket.send(
      messages.subscribeToLobby(this.#gameId, this.#options.hostId),
    );
  }

  #onMessage(data: unknown) {
    const { reader, recorder, logger } = this.#options.context;
    const frame = reader.read(gameFrameShape, data);
    if (frame?.gameId && frame.gameId !== this.#gameId) {
      logger.warn("🛰️ [Game] Frame for another game, ignored", { data });
      return;
    }

    recorder.record({
      source: "game",
      kind: frame?.code ?? "unreadable",
      body: data,
    });
    if (!frame) return;

    logger.info(`🛰️ [Game] ${frame.code}`, { data });
    if (this.#confirmsHost(frame)) this.#onHostConfirmed();
    this.#options.onFrame(frame);
  }

  #confirmsHost(frame: GameFrame) {
    return (
      frame.code === "ConnectionOpened" &&
      frame.playerId === this.#options.hostId
    );
  }

  #onHostConfirmed() {
    if (!this.#awaitingConfirmation) {
      // Every abort in the logs came from such a session, seconds later.
      this.#options.context.logger.warn(
        "🎮 Another session opened this game as the host",
        { gameId: this.#gameId },
      );
      return;
    }

    this.#awaitingConfirmation = false;
    this.#confirmed.resolve();
    void this.#resync();
  }

  /**
   * GeoGuessr has always confirmed, but its silence alone isn't worth losing
   * a game over: the socket is up, and reading the state tells the rest. A
   * late confirmation still counts as the first.
   */
  #proceedUnconfirmed() {
    this.#options.context.logger.warn("📡 No ConnectionOpened for the host", {
      gameId: this.#gameId,
    });
    this.#confirmed.resolve();
    void this.fetchState();
  }

  /** What the web client does on each confirmed connection. */
  async #resync() {
    await this.#join();
    await this.fetchState();
  }

  /** `POST /api/lobby/{id}/join`, the web client's way into a game. */
  async #join() {
    const { http, logger } = this.#options.context;
    try {
      await http.request(routes.joinGame(this.#gameId), { body: {} });
    } catch (error) {
      // Games run without it: never let it stop one.
      logger.warn("🎮 Could not join the game lobby", {
        gameId: this.#gameId,
        error,
      });
    }
  }
}
