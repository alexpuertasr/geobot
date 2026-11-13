import { randomInt } from "node:crypto";

/**
 * The web client's reconnect delays: two immediate tries, then 1s, 3s, 5s
 * and finally 15s — plus up to 250ms of jitter, so a server restart isn't
 * hit by every client at once.
 */
export const reconnectDelay = (attempt: number) =>
  baseDelay(attempt) + randomInt(0, 251);

const baseDelay = (attempt: number) => {
  if (attempt <= 2) return 0;
  if (attempt <= 4) return 1_000;
  if (attempt <= 10) return 3_000;
  if (attempt <= 18) return 5_000;
  return 15_000;
};
