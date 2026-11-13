import { APIError, ConnectionError } from "../../errors";

/** Besides network errors, what the web client automatically retries a GET on. */
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

export const isRetryableStatus = (status: number) =>
  RETRYABLE_STATUSES.has(status);

/**
 * Failures worth repeating a write that's safe to repeat after: no answer,
 * or any server-side error.
 */
export const isTransient = (error: unknown) =>
  error instanceof ConnectionError ||
  (error instanceof APIError && error.status >= 500);

/** The web client's backoff: 1s, 2s, 4s… */
export const retryDelay = (attempt: number) => 1000 * 2 ** attempt;
