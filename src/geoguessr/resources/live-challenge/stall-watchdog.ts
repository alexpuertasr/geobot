import type { LiveChallengeState } from "../../protocol/schemas/live-challenge";

import { nextPhaseChange } from "./rounds";

/** How overdue a round may be before we go and check. */
const GRACE_MS = 5_000;

/**
 * Calls `onStall` when a round overstays its countdown or its time without
 * any frame saying so: a frame can be lost even on a socket that stays up.
 */
export class StallWatchdog {
  readonly #onStall: (round: number) => void;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(onStall: (round: number) => void) {
    this.#onStall = onStall;
  }

  watch(state: LiveChallengeState) {
    this.stop();

    const due = nextPhaseChange(state)?.getTime();
    if (due === undefined || Number.isNaN(due)) return;

    const delay = Math.max(0, due + GRACE_MS - Date.now());
    this.#timer = setTimeout(
      () => this.#onStall(state.currentRoundNumber),
      delay,
    );
  }

  stop() {
    clearTimeout(this.#timer);
  }
}
