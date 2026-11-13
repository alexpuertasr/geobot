import recording from "../fixtures/recorded-game.json";

/** Replays at this many times the recorded speed. */
const SPEED_UP = 10;

type Frame = { code: string; liveChallenge?: { state?: unknown } | null };

type RecordedEvent =
  | { at: number; socket: "party" | "game"; frame: Frame }
  | { at: number; socket: "http"; advanceRoundResponse: object };

type FrameEvent = Extract<RecordedEvent, { frame: Frame }>;

export const recordedGame = {
  partyPage: recording.partyPage,
  gameId: recording.startResponse.gameLobbyId,
  startResponse: recording.startResponse,
};

/**
 * Plays a game recorded in production frame by frame, `SPEED_UP` times
 * faster — except that, like GeoGuessr, it doesn't start a round until the
 * host asks for it.
 */
export class RecordedGamePlayer {
  #frames: FrameEvent[];
  #advanceResponses: object[];
  #lastState: unknown = null;
  /** The host asked for the next round's countdown. */
  #hostAdvanced = false;
  /** Playback reached a countdown the host hasn't asked for yet. */
  #waitingForHost = false;
  /** When, in the recording, the last frame played. */
  #lastAt = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopped = false;

  constructor(readonly send: (socket: "party" | "game", frame: Frame) => void) {
    const events = recording.events as unknown as RecordedEvent[];
    this.#frames = events.filter(
      // The fake answers each connection with its own ConnectionOpened.
      (event): event is FrameEvent =>
        "frame" in event && event.frame.code !== "ConnectionOpened",
    );
    this.#advanceResponses = events.flatMap((event) =>
      "advanceRoundResponse" in event ? [event.advanceRoundResponse] : [],
    );
  }

  state() {
    return this.#lastState;
  }

  start() {
    this.#playNext();
  }

  /** Answers the host's advance with the recorded response; `null` if out of turn. */
  advanceTo(roundNumber: number): object | null {
    if (this.#hostAdvanced || this.#nextCountdownRound() !== roundNumber) {
      return null;
    }

    this.#hostAdvanced = true;
    if (this.#waitingForHost) {
      this.#waitingForHost = false;
      this.#playNext();
    }
    return this.#advanceResponses.shift() ?? null;
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#timer);
  }

  #playNext() {
    const next = this.#frames[0];
    if (!next || this.#stopped) return;

    const isCountdown = next.frame.code === "LiveChallengeRoundStarting";
    if (isCountdown && !this.#hostAdvanced) {
      this.#waitingForHost = true;
      return;
    }
    if (isCountdown) this.#hostAdvanced = false;

    // However long the host took, the countdown starts when it asks.
    const delay = isCountdown
      ? 0
      : (next.at - this.#lastAt) * (1000 / SPEED_UP);
    this.#timer = setTimeout(
      () => {
        this.#frames.shift();
        this.#lastAt = next.at;
        this.#play(next);
        this.#playNext();
      },
      Math.max(0, delay),
    );
  }

  #nextCountdownRound() {
    const countdown = this.#frames.find(
      ({ frame }) => frame.code === "LiveChallengeRoundStarting",
    );
    const state = countdown?.frame.liveChallenge?.state as
      | { currentRoundNumber: number }
      | undefined;
    return state?.currentRoundNumber;
  }

  #play({ socket, frame }: FrameEvent) {
    if (frame.liveChallenge?.state) this.#lastState = frame.liveChallenge.state;
    this.send(socket, frame);
  }
}
