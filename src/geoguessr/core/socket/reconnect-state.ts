import {
  CLOSE_SERVICE_RESTART,
  type CloseInfo,
} from "../../protocol/close-codes";

/** A socket that never opened gets its first try plus the web client's 4 retries. */
export const NEVER_OPENED_MAX_ATTEMPTS = 5;

export type ReconnectContext = {
  close: CloseInfo;
  /** Whether the socket ever opened. */
  wasConnected: boolean;
  /**
   * The number the next connection attempt will carry, counting since the
   * last healthy connection, the first attempt included.
   */
  attempt: number;
  /** When the socket went down (`Date.now()`). */
  downSince: number;
};

/**
 * Counts connection attempts and downtime. Only a connection that proves
 * healthy resets them, or a server that accepts and drops connections
 * straight away would be retried at full speed forever.
 */
export class ReconnectState {
  #attempt = 0;
  #downSince = 0;
  #wasConnected = false;
  #serviceRestarted = false;

  /** Counts a new attempt; `afterRestart` says if it follows a server restart. */
  beginAttempt(): { attempt: number; afterRestart: boolean } {
    const afterRestart = this.#serviceRestarted;
    this.#serviceRestarted = false;
    this.#attempt += 1;
    return { attempt: this.#attempt, afterRestart };
  }

  markOpened() {
    this.#wasConnected = true;
  }

  markHealthy() {
    this.#attempt = 0;
    this.#downSince = 0;
  }

  recordDrop(close: CloseInfo): ReconnectContext {
    if (this.#downSince === 0) this.#downSince = Date.now();
    if (close.code === CLOSE_SERVICE_RESTART) this.#serviceRestarted = true;

    return {
      close,
      wasConnected: this.#wasConnected,
      attempt: this.#attempt + 1,
      downSince: this.#downSince,
    };
  }
}
