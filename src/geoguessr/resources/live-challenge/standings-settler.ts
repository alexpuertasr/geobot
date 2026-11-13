/**
 * Final standings keep changing after `LiveChallengeFinished`: the last
 * leaderboard update lands 0.5–4.1s later, and changed the standings in
 * every logged game that got one. So the result waits until updates have
 * been quiet this long…
 */
const QUIET_MS = 5_000;
/** …or until this long after the finish, whichever comes first. */
export const MAX_STANDINGS_WAIT_MS = 15_000;

/** Calls `onSettled` once the final standings stop changing. */
export class StandingsSettler {
  readonly #onSettled: () => void;
  #finishedAt: number | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(onSettled: () => void) {
    this.#onSettled = onSettled;
  }

  gameFinished() {
    this.#finishedAt = Date.now();
    this.#schedule();
  }

  leaderboardUpdated() {
    if (this.#finishedAt !== null) this.#schedule();
  }

  stop() {
    clearTimeout(this.#timer);
  }

  #schedule() {
    const untilMaxWait =
      (this.#finishedAt ?? 0) + MAX_STANDINGS_WAIT_MS - Date.now();
    const delay = Math.max(0, Math.min(QUIET_MS, untilMaxWait));

    clearTimeout(this.#timer);
    this.#timer = setTimeout(this.#onSettled, delay);
  }
}
