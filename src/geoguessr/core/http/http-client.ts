import { setTimeout as sleep } from "node:timers/promises";

import type * as z from "zod";

import {
  APIError,
  AuthenticationError,
  ConnectionError,
  GeoGuessrError,
} from "../../errors";
import type { BaseUrls, ResolvedOptions, SdkLogger } from "../../options";
import type { Route } from "../../protocol/routes";
import type { Shape } from "../../protocol/schemas/shape";
import type { WebClientIdentity } from "../identity";
import { parseJsonOr } from "../parse";
import type { PayloadReader } from "../payload-reader";
import type { Recorder } from "../recorder";

export type HttpResponse = {
  status: number;
  url: string;
  headers: Headers;
  /** Parsed JSON when the body is JSON, otherwise the text. */
  body: unknown;
};

/** Waits before each retry of a GET; writes aren't idempotent, so never retried. */
const GET_RETRY_DELAYS_MS = [1_000, 2_000];
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_LOGGED_TEXT = 500;

/** Failures a safely repeatable request may be repeated after. */
export const isTransient = (error: unknown) =>
  error instanceof ConnectionError ||
  (error instanceof APIError && error.status >= 500);

/**
 * Talks HTTP to GeoGuessr as its web client — same identity, a JSON content
 * type on every request — and logs and records every response, so whatever
 * GeoGuessr changes shows in CloudWatch.
 */
export class HttpClient {
  readonly #identity: WebClientIdentity;
  readonly #reader: PayloadReader;
  readonly #recorder: Recorder;
  readonly #timeout: number;
  readonly #logger: SdkLogger;
  readonly #baseUrls: BaseUrls;

  constructor({
    identity,
    reader,
    recorder,
    options,
  }: {
    identity: WebClientIdentity;
    reader: PayloadReader;
    recorder: Recorder;
    options: ResolvedOptions;
  }) {
    this.#identity = identity;
    this.#reader = reader;
    this.#recorder = recorder;
    this.#timeout = options.timeout;
    this.#logger = options.logger;
    this.#baseUrls = options.baseUrls;
  }

  /**
   * Resolves with any 2xx response. Throws `APIError` for any other status,
   * and `ConnectionError` if no answer comes in time.
   */
  async request(
    route: Route,
    { body }: { body?: unknown } = {},
  ): Promise<HttpResponse> {
    const retryDelays = route.method === "GET" ? GET_RETRY_DELAYS_MS : [];

    for (let attempt = 0; ; attempt++) {
      const outcome = await this.#send(route, body);
      const delay = retryDelays[attempt];
      if (delay === undefined || !isRetryable(outcome)) {
        return this.#settle(route, outcome);
      }

      this.#logger.warn(`🌐 Retrying ${route.path} in ${delay}ms`, {
        attempt: attempt + 1,
        reason: outcome instanceof Error ? outcome.message : outcome.status,
      });
      await sleep(delay);
    }
  }

  /** `request()`, then the body read as `shape`. */
  async json<Schema extends z.ZodType>(
    shape: Shape<Schema>,
    route: Route,
    options?: { body?: unknown },
  ): Promise<z.output<Schema>> {
    return this.parse(shape, await this.request(route, options));
  }

  /** The body read as `shape`; throws if the SDK can't use it. */
  parse<Schema extends z.ZodType>(
    shape: Shape<Schema>,
    { url, body }: HttpResponse,
  ): z.output<Schema> {
    const data = this.#reader.read(shape, body);
    if (data !== null) return data;

    throw new GeoGuessrError(
      `Unexpected ${shape.name} from ${new URL(url).pathname}`,
    );
  }

  /** The response, or the `ConnectionError` that stands for its absence. */
  async #send(
    route: Route,
    body: unknown,
  ): Promise<HttpResponse | ConnectionError> {
    const startedAt = performance.now();
    try {
      const response = await fetch(
        `${this.#baseUrls[route.host]}${route.path}`,
        {
          method: route.method,
          headers: this.#headers(),
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.#timeout),
        },
      );
      // The plain-text 400s and the HTML party page aren't JSON.
      const text = await response.text();
      const parsed = text ? parseJsonOr(text, text) : text;

      this.#logger.info(`🌐 ${route.method} ${route.path}`, {
        status: response.status,
        url: response.url,
        durationMs: Math.round(performance.now() - startedAt),
        ...(body === undefined ? {} : { requestBody: body }),
        body: truncateForLog(parsed),
      });
      this.#recorder.record({
        source: "http",
        kind: route.name,
        status: response.status,
        body: parsed,
      });
      return {
        status: response.status,
        url: response.url,
        headers: response.headers,
        body: parsed,
      };
    } catch (error) {
      return this.#connectionError(route, error);
    }
  }

  #headers(): Record<string, string> {
    const { clientVersion } = this.#identity;
    return {
      ...this.#identity.browserHeaders(),
      "content-type": "application/json",
      ...(clientVersion ? { "x-client": clientVersion } : {}),
    };
  }

  #connectionError(route: Route, error: unknown) {
    const reason =
      error instanceof DOMException && error.name === "TimeoutError"
        ? `timed out after ${this.#timeout}ms`
        : causeOf(error);
    this.#logger.warn(`🌐 ${route.method} ${route.path} failed`, { reason });

    return new ConnectionError(`${route.method} ${route.path} ${reason}`, {
      cause: error,
    });
  }

  #settle(route: Route, outcome: HttpResponse | ConnectionError): HttpResponse {
    if (outcome instanceof ConnectionError) throw outcome;

    const { status, url, body, headers } = outcome;
    if (status >= 200 && status < 300) return outcome;

    const ErrorClass =
      status === 401 || status === 403 ? AuthenticationError : APIError;
    // Without this, a Cloudflare block would read as expired cookies.
    const blocked = headers.get("cf-mitigated") === "challenge";

    throw new ErrorClass({
      status,
      method: route.method,
      url,
      body,
      message: blocked
        ? `${route.method} ${route.path} was blocked by a Cloudflare challenge`
        : undefined,
    });
  }
}

const isRetryable = (outcome: HttpResponse | ConnectionError) =>
  outcome instanceof ConnectionError || RETRYABLE_STATUSES.has(outcome.status);

const truncateForLog = (body: unknown) =>
  typeof body === "string" && body.length > MAX_LOGGED_TEXT
    ? `${body.slice(0, MAX_LOGGED_TEXT)}… (${body.length} chars)`
    : body;

const causeOf = (error: unknown) => {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? error.cause.message : error.message;
};
