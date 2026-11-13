import type { ClientContext } from "../../core/context";
import { Emitter, type Listener, type Unsubscribe } from "../../core/emitter";
import type { Recording } from "../../core/recorder";
import { GeoGuessrError } from "../../errors";
import { partyTopic } from "../../protocol/messages";
import { GEOGUESSR_ORIGIN, routes } from "../../protocol/routes";
import type { NotificationFrame } from "../../protocol/schemas/frames";
import {
  type MemberData,
  type PartyData,
  partyShape,
} from "../../protocol/schemas/party";
import { estimateGameDuration } from "../live-challenge/game-duration";
import { LiveChallenge } from "../live-challenge/live-challenge";

import {
  type PartyEvent,
  type PartyEvents,
  readPartyFrame,
} from "./party-events";
import { requestGameStart } from "./request-game-start";

/**
 * A party the bot owns. Its snapshot stays current while the bot is present
 * in it — `startGame()` makes it so, because the game server only counts
 * present players.
 */
export class Party implements AsyncDisposable {
  readonly id: string;

  readonly #context: ClientContext;
  readonly #events: Emitter<PartyEvents>;
  #data: PartyData;
  /** `null` when GeoGuessr didn't say (its JSON API has no member list). */
  #members: MemberData[] | null;
  #presence: Promise<Unsubscribe> | null = null;
  #disbanded = false;

  /** @internal Use `geoguessr.parties`. */
  constructor({
    data,
    members,
    context,
  }: {
    data: PartyData;
    members: MemberData[] | null;
    context: ClientContext;
  }) {
    this.id = data.partyId;
    this.#data = data;
    this.#members = members;
    this.#context = context;
    this.#events = new Emitter((error, event) =>
      context.logger.error(`💥 [Party] Listener failed handling ${event}`, {
        partyId: this.id,
        error,
      }),
    );
    context.lifetime.track({ close: () => this.disconnect() });
  }

  /** The latest snapshot, as GeoGuessr sends it. */
  get data(): PartyData {
    return this.#data;
  }

  /** Everyone in the party, the bot included; empty if GeoGuessr didn't say. */
  get members(): readonly MemberData[] {
    return this.#members ?? [];
  }

  get owner(): MemberData {
    return this.#data.owner;
  }

  get gameState(): PartyData["gameState"] {
    return this.#data.gameState;
  }

  get gameSettings(): PartyData["gameSettings"] {
    return this.#data.gameSettings;
  }

  /** The link players open to join; `j=3` is what GeoGuessr's share button adds. */
  get joinLink(): string {
    return `${GEOGUESSR_ORIGIN}/join/${this.#data.joinCode.code}?j=3`;
  }

  get expiresAt(): Date | null {
    const { expiresAt } = this.#data;
    return expiresAt == null ? null : new Date(expiresAt);
  }

  /** An expired party can't be extended: create a new one. */
  get isExpired(): boolean {
    const expiresAt = this.expiresAt;
    return expiresAt !== null && expiresAt.getTime() <= Date.now();
  }

  /**
   * Whether a game is running or anyone besides the bot is present — or,
   * to be safe, the members are unknown. The bot's own presence only says
   * whether some bot process holds a socket.
   */
  get isInUse(): boolean {
    if (this.gameState === "Ongoing" || this.#members === null) return true;

    return this.#members.some(
      (member) => member.isPresent && member.userId !== this.owner.userId,
    );
  }

  /**
   * Listens to a party event; returns the unsubscribe. Events only arrive
   * while the bot is connected, and a failing listener is only logged.
   */
  on<Event extends keyof PartyEvents>(
    event: Event,
    listener: Listener<PartyEvents[Event]>,
  ): Unsubscribe {
    return this.#events.on(event, listener);
  }

  once<Event extends keyof PartyEvents>(
    event: Event,
    listener: Listener<PartyEvents[Event]>,
  ): Unsubscribe {
    return this.#events.once(event, listener);
  }

  /**
   * Makes the bot present in the party, and keeps it so — across
   * reconnects — until `disconnect()` or the client closes. Idempotent.
   */
  async connect(): Promise<void> {
    this.#assertUsable();
    this.#presence ??= this.#subscribe();

    try {
      await this.#presence;
    } catch (error) {
      this.#presence = null;
      throw error;
    }
  }

  /** Stops being present in the party; the party itself stays. */
  async disconnect(): Promise<void> {
    const presence = this.#presence;
    this.#presence = null;

    const unsubscribe = await presence?.catch(() => null);
    unsubscribe?.();
  }

  /** Re-reads the party from GeoGuessr; listeners get `updated`. */
  async refresh(): Promise<PartyData> {
    this.#assertUsable();

    const data = await this.#context.http.json(
      partyShape,
      routes.party(this.id),
    );
    this.#apply({ type: "updated", payload: { party: data } });
    return data;
  }

  /**
   * Starts a Live Challenge with everyone present, like the host's "Start
   * game", and resolves once the bot is in it. Its events flow from then
   * on: attach listeners before your next `await`.
   *
   * @throws {NotEnoughPlayersError} fewer than two players are present.
   */
  async startGame(): Promise<LiveChallenge> {
    const recording = this.#context.recorder.start();
    try {
      await this.connect();

      const gameId = await requestGameStart(this, this.#context);
      this.#context.logger.info("🎲 Game started", {
        partyId: this.id,
        gameId,
      });

      return await this.#enter(gameId, recording);
    } catch (error) {
      recording.stop();
      throw error;
    }
  }

  /** "Disband party": everyone is sent home, and this handle is spent. */
  async disband(): Promise<void> {
    this.#assertUsable();

    await this.#context.http.request(routes.disbandParty());
    this.#disbanded = true;
    await this.disconnect();
  }

  /** Milliseconds a game with these settings takes, at most, given the pause between rounds. */
  estimateGameDuration({
    roundTransitionMs,
  }: {
    roundTransitionMs: number;
  }): number {
    return estimateGameDuration(this.gameSettings, roundTransitionMs);
  }

  [Symbol.asyncDispose]() {
    return this.disconnect();
  }

  toJSON() {
    return this.#data;
  }

  #subscribe() {
    const { notifications, logger } = this.#context;

    return notifications.subscribe(partyTopic(this.id), {
      onFrame: (frame) => this.#onFrame(frame),
      // Whatever happened while the socket was down is lost: catch up.
      onReconnect: () => {
        this.refresh().catch((error: unknown) =>
          logger.warn("📡 Could not refresh the party", {
            partyId: this.id,
            error,
          }),
        );
      },
      onLost: (error) =>
        logger.error("📡 Lost the party connection", {
          partyId: this.id,
          error,
        }),
    });
  }

  async #enter(gameId: string, recording: Recording): Promise<LiveChallenge> {
    const game = new LiveChallenge({
      id: gameId,
      party: this,
      recording,
      context: this.#context,
    });

    try {
      await game.connect();
      return game;
    } catch (error) {
      await game.close();
      throw error;
    }
  }

  #onFrame(frame: NotificationFrame) {
    // The topic is already this party's, but the web client checks too.
    const { partyId } = (frame.payload ?? {}) as { partyId?: unknown };
    if (partyId && partyId !== this.id) return;

    const event = readPartyFrame(frame, this.#context.reader);
    if (event) this.#apply(event);
  }

  #apply(event: PartyEvent) {
    if (event.type === "updated") this.#data = event.payload.party;
    if (event.type === "membersUpdated") this.#members = event.payload.members;
    this.#events.emit(event.type, event.payload);
  }

  #assertUsable() {
    this.#context.lifetime.assertOpen();
    if (this.#disbanded) throw new GeoGuessrError("The party was disbanded");
  }
}
