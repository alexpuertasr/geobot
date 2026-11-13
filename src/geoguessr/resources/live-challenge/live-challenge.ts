import { setTimeout as sleep } from "node:timers/promises";

import { abortable } from "../../core/abortable";
import type { ClientContext } from "../../core/context";
import { deferred } from "../../core/deferred";
import { Emitter, type Listener, type Unsubscribe } from "../../core/emitter";
import { isTransient } from "../../core/http/http-client";
import { parseOrLog } from "../../core/parse";
import { ConnectionError, GeoGuessrError } from "../../errors";
import { routes } from "../../protocol/routes";
import type { GameFrame } from "../../protocol/schemas/frames";
import {
  type LeaderboardEntry,
  type LiveChallengeState,
  leaderboardsSchema,
  liveChallengeStateSchema,
} from "../../protocol/schemas/live-challenge";
import type { Party } from "../party/party";

import type { AbortReason, GameResult, LiveChallengeEvents } from "./events";
import { GameConnection } from "./game-connection";
import { RoundTracker } from "./round-tracker";
import { byPosition, nextRoundNumber } from "./rounds";
import { StallWatchdog } from "./stall-watchdog";
import { StandingsSettler } from "./standings-settler";

/**
 * advance-round is a write, so it isn't retried like a GET; but repeating
 * it is safe (it names the target round), and one lost request would
 * otherwise leave everyone stuck on a finished round.
 */
const ADVANCE_RETRIES = 2;
const ADVANCE_RETRY_DELAY_MS = 1_000;

type Status =
  | "connecting"
  | "live"
  | "finished"
  | "aborted"
  | "failed"
  | "closed";

/**
 * A Live Challenge the bot hosts, from `party.startGame()` until `done()`:
 * it keeps the latest game state, announces each round as it happens, and
 * ends on its own — finished once the final standings settle, or aborted.
 *
 * Events flow once `startGame()` has resolved: attach listeners before your
 * next `await`.
 */
export class LiveChallenge implements AsyncDisposable {
  readonly id: string;
  readonly party: Party;

  readonly #context: ClientContext;
  readonly #events: Emitter<LiveChallengeEvents>;
  readonly #connection: GameConnection;
  readonly #rounds = new RoundTracker();
  readonly #watchdog: StallWatchdog;
  readonly #settler: StandingsSettler;
  readonly #result = deferred<GameResult>();
  readonly #stopWatchingParty: Unsubscribe;
  readonly #untrack: () => void;

  #status: Status = "connecting";
  #failure: unknown;
  #state: LiveChallengeState | null = null;
  #standings: LeaderboardEntry[] = [];
  #advancing: Promise<boolean> | null = null;
  #closing: Promise<void> | null = null;

  /** @internal Use `party.startGame()`. */
  constructor({
    id,
    party,
    context,
  }: {
    id: string;
    party: Party;
    context: ClientContext;
  }) {
    this.id = id;
    this.party = party;
    this.#context = context;

    this.#events = new Emitter((error, event) =>
      this.#onListenerError(error, event),
    );
    this.#connection = this.#createConnection();
    this.#watchdog = new StallWatchdog((round) => this.#onStall(round));
    this.#settler = new StandingsSettler(() => this.#onStandingsSettled());
    this.#stopWatchingParty = this.#watchParty();
    this.#untrack = context.lifetime.track(this);
  }

  /** The latest game state; `null` before the first. */
  get state(): LiveChallengeState | null {
    return this.#state;
  }

  /** The current round (1-based); 0 before the game starts. */
  get round(): number {
    return this.#state?.currentRoundNumber ?? 0;
  }

  get roundCount(): number | null {
    return this.#state?.roundCount ?? null;
  }

  /** The latest game leaderboard, best first. */
  get standings(): readonly LeaderboardEntry[] {
    return this.#standings;
  }

  /** Whether the game is still being played. */
  get isLive(): boolean {
    return this.#status === "connecting" || this.#status === "live";
  }

  /**
   * Listens to a game event; returns the unsubscribe. Listeners may be async.
   * One that throws fails the game — `done()` rejects with its error — so
   * guard best-effort side effects (like chat posts) yourself.
   */
  on<Event extends keyof LiveChallengeEvents>(
    event: Event,
    listener: Listener<LiveChallengeEvents[Event]>,
  ): Unsubscribe {
    return this.#events.on(event, listener);
  }

  once<Event extends keyof LiveChallengeEvents>(
    event: Event,
    listener: Listener<LiveChallengeEvents[Event]>,
  ): Unsubscribe {
    return this.#events.once(event, listener);
  }

  /**
   * Resolves when the game is over: finished (once the final standings
   * settle) or aborted. Rejects if the connection can't be kept, a listener
   * fails, or the game is closed first — and with `signal.reason` if `signal`
   * aborts, though the game itself carries on.
   */
  done({ signal }: { signal?: AbortSignal } = {}): Promise<GameResult> {
    const result = this.#result.promise;
    return signal ? abortable(result, signal) : result;
  }

  /**
   * Starts the next round's countdown, like the host's "Start next round" —
   * rounds never advance on their own. Resolves `false`, without calling
   * GeoGuessr, when there's nothing to advance: the game is over (say,
   * aborted during your pause), the round hasn't ended, or it was the last.
   * Transient failures are retried.
   */
  advanceRound(): Promise<boolean> {
    this.#advancing ??= this.#advance().finally(() => {
      this.#advancing = null;
    });
    return this.#advancing;
  }

  /**
   * Closes the connection — the game itself goes on — and rejects a pending
   * `done()`. Done for you when the game ends.
   */
  close(): Promise<void> {
    this.#closing ??= this.#shutDown();
    return this.#closing;
  }

  [Symbol.asyncDispose]() {
    return this.close();
  }

  /** @internal Joins the game; resolves once the bot is connected to it. */
  async connect(): Promise<void> {
    try {
      await this.#connection.open();
    } catch (error) {
      // If the game ended meanwhile, its status explains better than this.
      if (this.#status === "connecting") throw error;
    }
    this.#goLive();
  }

  get #resultPending(): boolean {
    return this.isLive || this.#status === "finished";
  }

  #goLive() {
    switch (this.#status) {
      case "connecting":
        this.#status = "live";
        return;
      case "aborted":
        // Aborted while connecting: the caller gets a game that says so.
        return;
      case "failed":
        throw this.#failure;
      default:
        throw new GeoGuessrError(
          `The game was ${this.#status} while connecting`,
        );
    }
  }

  #onFrame(frame: GameFrame) {
    this.#events.emit("frame", frame);

    switch (frame.code) {
      case "GameAborted":
        this.#abort("gameAborted");
        return;
      case "LiveChallengeLeaderboardUpdate":
        this.#applyLeaderboards(frame.liveChallenge?.leaderboards);
        return;
    }

    if (frame.liveChallenge?.state) this.#applyState(frame.liveChallenge.state);

    // The web client re-reads the game on these too.
    if (frame.code === "LiveChallengeStarted" || frame.code === "LobbyClosed") {
      void this.#connection.fetchState();
    }
  }

  #applyState(data: unknown) {
    const state = this.#acceptState(data);
    // Before `startGame()` returns nobody can listen yet: the next state
    // announces whatever this one would have.
    if (!state || this.#status === "connecting") return;

    for (const { event, payload } of this.#rounds.announcementsFor(state)) {
      this.#events.emit(event, payload);
    }

    if (state.status === "Finished") {
      this.#finish(state);
    } else {
      this.#watchdog.watch(state);
    }
  }

  /** Keeps `data` as the latest state, unless it's unreadable or stale. */
  #acceptState(data: unknown): LiveChallengeState | null {
    if (!this.isLive) return null;

    const state = parseOrLog(liveChallengeStateSchema, data, {
      logger: this.#context.logger,
      message: "🛰️ [Game] Failed to parse state",
    });
    if (!state || state.version < (this.#state?.version ?? 0)) return null;

    this.#state = state;
    return state;
  }

  #applyLeaderboards(data: unknown) {
    const leaderboards = parseOrLog(leaderboardsSchema, data, {
      logger: this.#context.logger,
      message: "🛰️ [Game] Failed to parse leaderboards",
    });
    if (!leaderboards) return;

    const entries = leaderboards.game?.entries;
    if (entries?.length) this.#standings = byPosition(entries);
    if (this.#status === "finished") this.#settler.leaderboardUpdated();

    this.#events.emit("leaderboardUpdated", {
      standings: [...this.#standings],
      leaderboards,
    });
  }

  async #advance(): Promise<boolean> {
    const toRound =
      this.isLive && this.#state ? nextRoundNumber(this.#state) : null;
    return toRound === null ? false : this.#requestAdvance(toRound, 0);
  }

  async #requestAdvance(toRound: number, attempt: number): Promise<boolean> {
    try {
      const response = await this.#context.http.request(
        routes.advanceRound(this.id),
        { body: { toRoundNumber: toRound } },
      );
      this.#applyState(response.body);
      return true;
    } catch (error) {
      return this.#recoverFromFailedAdvance(toRound, attempt, error);
    }
  }

  async #recoverFromFailedAdvance(
    toRound: number,
    attempt: number,
    error: unknown,
  ): Promise<boolean> {
    // A lost response may still have advanced it: the state knows.
    await this.#connection.fetchState();
    if (!this.isLive) return false;
    if (this.round >= toRound) return true;
    if (!isTransient(error) || attempt >= ADVANCE_RETRIES) throw error;

    this.#context.logger.warn("🎮 advance-round failed, retrying", {
      gameId: this.id,
      toRound,
      error,
    });
    await sleep(ADVANCE_RETRY_DELAY_MS);
    return this.#requestAdvance(toRound, attempt + 1);
  }

  #finish(state: LiveChallengeState) {
    this.#status = "finished";
    this.#watchdog.stop();
    this.#events.emit("finished", { roundCount: state.roundCount, state });
    this.#settler.gameFinished();
  }

  #onStandingsSettled() {
    this.#resolveFinished();
    this.#closeInBackground();
  }

  #resolveFinished() {
    const state = this.#state;
    if (this.#status !== "finished" || !state) return;

    this.#result.resolve({
      outcome: "finished",
      standings: [...this.#standings],
      state,
    });
  }

  #abort(reason: AbortReason) {
    if (!this.isLive) return;

    this.#context.logger.warn("🛑 Game aborted", { gameId: this.id, reason });
    this.#status = "aborted";
    this.#connection.stopWaiting();
    this.#events.emit("aborted", { reason });
    this.#result.resolve({
      outcome: "aborted",
      reason,
      standings: [...this.#standings],
      state: this.#state,
    });
    this.#closeInBackground();
  }

  #fail(error: unknown) {
    if (this.#status === "finished" && error instanceof ConnectionError) {
      // Losing the socket while the standings settle only cuts the wait.
      this.#onStandingsSettled();
      return;
    }
    if (!this.#resultPending) return;

    this.#status = "failed";
    this.#failure = error;
    this.#connection.stopWaiting();
    this.#result.reject(error);
    this.#closeInBackground();
  }

  async #shutDown() {
    this.#settleOnClose();
    await this.#release();
  }

  #settleOnClose() {
    if (this.#status === "finished") {
      this.#resolveFinished();
    } else if (this.isLive) {
      this.#status = "closed";
      this.#connection.stopWaiting();
      this.#result.reject(
        new GeoGuessrError("The game was closed before it ended"),
      );
    }
  }

  async #release() {
    this.#settler.stop();
    this.#watchdog.stop();
    this.#stopWatchingParty();
    this.#untrack();
    await this.#connection.close();
  }

  /** Nothing awaits a close once the game is over: it must never throw. */
  #closeInBackground() {
    this.close().catch((error: unknown) => {
      this.#context.logger.warn("📡 Could not close the game", {
        gameId: this.id,
        error,
      });
    });
  }

  #createConnection() {
    return new GameConnection({
      gameId: this.id,
      hostId: this.party.owner.userId,
      context: this.#context,
      isGameLive: () => this.isLive,
      onFrame: (frame) => this.#onFrame(frame),
      onState: (state) => this.#applyState(state),
      onLost: (error) => this.#fail(error),
    });
  }

  /**
   * The party hears of an abort too — and, since it re-reads itself after a
   * reconnect, of one that happened while both sockets were down. It's the
   * only place a disband shows.
   */
  #watchParty(): Unsubscribe {
    const unsubscribes = [
      this.party.on("updated", ({ party }) => {
        if (party.gameState === "NoGame") this.#abort("gameAborted");
      }),
      this.party.on("disbanded", () => this.#abort("partyDisbanded")),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }

  #onStall(round: number) {
    this.#context.logger.warn("🎮 Round overdue, fetching the state", {
      gameId: this.id,
      round,
    });
    void this.#connection.fetchState();
  }

  #onListenerError(error: unknown, event: keyof LiveChallengeEvents) {
    this.#context.logger.error(`💥 [Game] Listener failed handling ${event}`, {
      gameId: this.id,
      error,
    });
    this.#fail(error);
  }
}
