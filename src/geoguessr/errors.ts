/**
 * Every error the SDK throws extends `GeoGuessrError`, so one `instanceof`
 * catches them all; the subclasses say what went wrong.
 */
export class GeoGuessrError extends Error {
  override name = "GeoGuessrError";
}

export type APIErrorDetails = {
  status: number;
  method: string;
  url: string;
  /** Parsed JSON when the body is JSON, otherwise the text. */
  body: unknown;
  message?: string;
};

/** GeoGuessr answered with a non-2xx status. */
export class APIError extends GeoGuessrError {
  override name = "APIError";

  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly body: unknown;

  constructor({ status, method, url, body, message }: APIErrorDetails) {
    super(message ?? describeFailure({ status, method, url, body }));
    this.status = status;
    this.method = method;
    this.url = url;
    this.body = body;
  }
}

/** The session cookies are missing or expired: refresh `GeoguessrCookies`. */
export class AuthenticationError extends APIError {
  override name = "AuthenticationError";
}

/** The game can't start: fewer than two players are present in the party. */
export class NotEnoughPlayersError extends APIError {
  override name = "NotEnoughPlayersError";
}

/** GeoGuessr answered 2xx, but not with the shape the SDK expects. */
export class UnexpectedResponseError extends GeoGuessrError {
  override name = "UnexpectedResponseError";

  readonly url: string;
  readonly body: unknown;

  constructor({
    url,
    body,
    reason,
  }: { url: string; body: unknown; reason: string }) {
    super(`Unexpected response from ${new URL(url).pathname}: ${reason}`);
    this.url = url;
    this.body = body;
  }
}

/** GeoGuessr couldn't be reached: a request got no answer, or a socket was lost. */
export class ConnectionError extends GeoGuessrError {
  override name = "ConnectionError";
}

/** A socket closed and could not (or must not) be reconnected. */
export class ConnectionLostError extends ConnectionError {
  override name = "ConnectionLostError";

  readonly code: number;
  readonly reason: string;

  constructor({
    socket,
    code,
    reason,
  }: { socket: string; code: number; reason: string }) {
    super(
      `The ${socket} socket closed with ${code}${reason ? ` (${reason})` : ""}`,
    );
    this.code = code;
    this.reason = reason;
  }
}

/** A handle was used after it, or its client, was closed. */
export class ClosedError extends GeoGuessrError {
  override name = "ClosedError";
}

/**
 * The human-readable part of a GeoGuessr error body: `message` (or
 * `Message`) on JSON errors, the text itself on plain-text ones.
 */
export const serverMessage = (body: unknown): string | null => {
  if (typeof body === "string") return body.trim().slice(0, 300) || null;
  if (!body || typeof body !== "object") return null;

  const { message, Message, error } = body as Record<string, unknown>;
  const text = [message, Message, error].find(
    (value) => typeof value === "string" && value,
  );
  return typeof text === "string" ? text : null;
};

const describeFailure = ({ status, method, url, body }: APIErrorDetails) => {
  const detail = serverMessage(body);
  const path = new URL(url).pathname;
  return `${method} ${path} failed with ${status}${detail ? `: ${detail}` : ""}`;
};
