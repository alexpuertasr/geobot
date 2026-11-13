/** How a fake game paces itself: GeoGuessr's rhythm, sped up. */
export const PACE = {
  startDelay: 200,
  roundLength: 600,
  countdown: 200,
  /** A round's guesses are scored this long after it ends. */
  roundScoring: 100,
  /** Last-moment guesses are scored this long after the game finishes. */
  finalScoring: 400,
};

export type FakeGameEvents = {
  send: (code: string, liveChallenge: object | null) => void;
  finished: () => void;
};

type Round = {
  roundNumber: number;
  state: "Starting" | "Ongoing" | "Ended";
  startTime: string;
  endTime: string;
};

/**
 * A Live Challenge that plays itself the way GeoGuessr's does: rounds wait
 * for the host to advance them, and the last guesses are scored after the
 * game has already finished.
 */
export class FakeGame {
  readonly id: string;
  #version = 0;
  #status: "Ongoing" | "Finished" = "Ongoing";
  #rounds: Round[] = [];
  #scores = new Map([["player-1", 0]]);
  #stopped = false;
  #timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    id: string,
    readonly roundCount: number,
    readonly events: FakeGameEvents,
  ) {
    this.id = id;
  }

  get currentRound() {
    return this.#rounds.at(-1)?.roundNumber ?? 0;
  }

  state() {
    return {
      gameId: this.id,
      status: this.#status,
      version: this.#version,
      currentRoundNumber: this.currentRound,
      roundCount: this.roundCount,
      rounds: structuredClone(this.#rounds),
      mapName: "",
      // GeoGuessr adds fields over time; the SDK must not mind.
      unknownNewField: { added: "by GeoGuessr later" },
    };
  }

  start() {
    this.#addRound(1, PACE.startDelay);
    this.#after(PACE.startDelay, () => this.#play(1, "LiveChallengeStarted"));
  }

  /** What the host's "Start next round" does; `false` if it isn't allowed. */
  advanceTo(roundNumber: number): boolean {
    const current = this.#rounds.at(-1);
    if (roundNumber !== this.currentRound + 1 || current?.state !== "Ended") {
      return false;
    }

    this.#addRound(roundNumber, PACE.countdown);
    this.#send("LiveChallengeRoundStarting");
    this.#after(PACE.countdown, () =>
      this.#play(roundNumber, "LiveChallengeRoundStarted"),
    );
    return true;
  }

  stop() {
    this.#stopped = true;
    for (const timer of this.#timers) clearTimeout(timer);
  }

  #addRound(roundNumber: number, startsIn: number) {
    this.#version += 1;
    this.#rounds.push({
      roundNumber,
      state: "Starting",
      startTime: inMs(startsIn),
      endTime: inMs(startsIn + PACE.roundLength),
    });
  }

  #play(roundNumber: number, code: string) {
    this.#setRoundState(roundNumber, "Ongoing");
    this.#send(code);
    this.#after(PACE.roundLength, () => this.#end(roundNumber));
  }

  #end(roundNumber: number) {
    this.#setRoundState(roundNumber, "Ended");
    this.#send("LiveChallengeRoundEnded");
    this.#after(PACE.roundScoring, () => this.#score(100));

    if (roundNumber === this.roundCount) this.#finish();
  }

  #finish() {
    this.#status = "Finished";
    this.#version += 1;
    this.#send("LiveChallengeFinished");
    this.#after(PACE.finalScoring, () => {
      this.#score(5_000);
      this.events.finished();
    });
  }

  #score(points: number) {
    this.#scores.set("player-1", (this.#scores.get("player-1") ?? 0) + points);
    const entries = [...this.#scores].map(([id, score], index) => ({
      id,
      name: "Player 1",
      position: index + 1,
      score,
    }));
    this.events.send("LiveChallengeLeaderboardUpdate", {
      state: null,
      leaderboards: { game: { entries }, round: null },
    });
  }

  #setRoundState(roundNumber: number, state: Round["state"]) {
    const round = this.#rounds.find((r) => r.roundNumber === roundNumber);
    if (round) round.state = state;
    this.#version += 1;
  }

  #send(code: string) {
    if (!this.#stopped) this.events.send(code, { state: this.state() });
  }

  #after(ms: number, action: () => void) {
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      if (!this.#stopped) action();
    }, ms);
    this.#timers.add(timer);
  }
}

const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();
