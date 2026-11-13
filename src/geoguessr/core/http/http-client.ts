import { setTimeout as sleep } from "node:timers/promises";

import * as z from "zod";

import {
  APIError,
  AuthenticationError,
  ConnectionError,
  UnexpectedResponseError,
} from "../../errors";
import type { BaseUrls, ResolvedOptions, SdkLogger } from "../../options";
import type { Route } from "../../protocol/routes";
import type { WebClientIdentity } from "../identity";
import { parseJsonOr } from "../parse";

import { isRetryableStatus, retryDelay } from "./retry";

export type HttpResponse = {
  status: number;
  url: string;
  headers: Headers;
  /** Parsed JSON when the body is JSON, otherwise the text. */
  body: unknown;
};

export type RequestOptions = { body?: unknown; signal?: AbortSignal };

type Call = {
  route: Route;
  body: unknown;
  /** The caller's own signal, whose reason is rethrown as is. */
  signal: AbortSignal | undefined;
  deadline: AbortSignal;
  abort: AbortSignal;
};

const MAX_LOGGED_TEXT = 500;

/**
 * Talks HTTP to GeoGuessr the way its web client does: as its identity, with
 * a JSON content type on every request, and retrying GETs only (writes
 * aren't idempotent), all within one deadline.
 */
export class HttpClient {
  readonly #identity: WebClientIdentity;
  readonly #timeout: number;
  readonly #maxRetries: number;
  readonly #logger: SdkLogger;
  readonly #baseUrls: BaseUrls;

  constructor(identity: WebClientIdentity, options: ResolvedOptions) {
    this.#identity = identity;
    this.#timeout = options.timeout;
    this.#maxRetries = options.maxRetries;
    this.#logger = options.logger;
    this.#baseUrls = options.baseUrls;
  }

  /**
   * Resolves with any 2xx response. Throws `APIError` for any other status,
   * and `ConnectionError` if no answer comes in time.
   */
  request(
    route: Route,
    { body, signal }: RequestOptions = {},
  ): Promise<HttpResponse> {
    const deadline = AbortSignal.timeout(this.#timeout);
    const abort = signal ? AbortSignal.any([signal, deadline]) : deadline;

    return this.#attempt({ route, body, signal, deadline, abort }, 0);
  }

  /** `request()`, then the body validated against `schema`. */
  async json<Schema extends z.ZodType>(
    schema: Schema,
    route: Route,
    options?: RequestOptions,
  ): Promise<z.output<Schema>> {
    return this.parse(schema, await this.request(route, options));
  }

  parse<Schema extends z.ZodType>(
    schema: Schema,
    { url, body }: HttpResponse,
  ): z.output<Schema> {
    const result = schema.safeParse(body);
    if (result.success) return result.data;

    const reason = z.prettifyError(result.error);
    this.#logger.error("🌐 Unexpected response shape", { url, body, reason });
    throw new UnexpectedResponseError({ url, body, reason });
  }

  async #attempt(call: Call, attempt: number): Promise<HttpResponse> {
    const canRetry = () =>
      call.route.method === "GET" &&
      attempt < this.#maxRetries &&
      !call.deadline.aborted;

    let response: HttpResponse;
    try {
      response = await this.#send(call);
    } catch (error) {
      if (call.signal?.aborted) throw call.signal.reason;

      const failure = this.#connectionError(call, error);
      if (!canRetry()) throw failure;
      return this.#retry(call, attempt, failure.message);
    }

    if (canRetry() && isRetryableStatus(response.status)) {
      return this.#retry(call, attempt, `status ${response.status}`);
    }
    return this.#ensureOk(call.route, response);
  }

  async #retry(call: Call, attempt: number, reason: string) {
    const delay = retryDelay(attempt);
    this.#logger.warn(`🌐 Retrying ${call.route.path} in ${delay}ms`, {
      attempt: attempt + 1,
      reason,
    });

    // An abort cuts the wait short; the next attempt then reports it.
    await sleep(delay, undefined, { signal: call.abort }).catch(() => {});
    return this.#attempt(call, attempt + 1);
  }

  async #send({ route, body, abort }: Call): Promise<HttpResponse> {
    const startedAt = performance.now();
    const response = await fetch(`${this.#baseUrls[route.host]}${route.path}`, {
      method: route.method,
      headers: this.#headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abort,
    });
    // The plain-text 400s and the HTML party page aren't JSON.
    const text = await response.text();
    const parsed = text ? parseJsonOr(text, text) : text;

    this.#logger.info(`🌐 ${route.method} ${route.path}`, {
      status: response.status,
      url: response.url,
      durationMs: Math.round(performance.now() - startedAt),
      body: truncateForLog(parsed),
    });

    return {
      status: response.status,
      url: response.url,
      headers: response.headers,
      body: parsed,
    };
  }

  #headers(): Record<string, string> {
    const { clientVersion } = this.#identity;
    return {
      ...this.#identity.browserHeaders(),
      "content-type": "application/json",
      ...(clientVersion ? { "x-client": clientVersion } : {}),
    };
  }

  #connectionError({ route, deadline }: Call, error: unknown) {
    const reason = deadline.aborted
      ? `timed out after ${this.#timeout}ms`
      : causeOf(error);
    this.#logger.warn(`🌐 ${route.method} ${route.path} failed`, { reason });

    return new ConnectionError(`${route.method} ${route.path} ${reason}`, {
      cause: error,
    });
  }

  #ensureOk(route: Route, response: HttpResponse): HttpResponse {
    const { status, url, body, headers } = response;
    if (status >= 200 && status < 300) return response;

    const ErrorClass =
      status === 401 || status === 403 ? AuthenticationError : APIError;
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

const truncateForLog = (body: unknown) =>
  typeof body === "string" && body.length > MAX_LOGGED_TEXT
    ? `${body.slice(0, MAX_LOGGED_TEXT)}… (${body.length} chars)`
    : body;

const causeOf = (error: unknown) => {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? error.cause.message : error.message;
};
