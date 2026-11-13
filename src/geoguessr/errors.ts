/**
 * Every error the SDK throws is a `GeoGuessrError` — for a closed handle or
 * an unexpected response, the base class itself; the subclasses are the
 * failures callers act on.
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

/**
 * GeoGuessr couldn't be reached: a request got no answer, or a socket closed
 * for good — then `code` is its close code.
 */
export class ConnectionError extends GeoGuessrError {
  override name = "ConnectionError";

  readonly code: number | null;

  constructor(message: string, options?: { cause?: unknown; code?: number }) {
    super(message, { cause: options?.cause });
    this.code = options?.code ?? null;
  }
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
