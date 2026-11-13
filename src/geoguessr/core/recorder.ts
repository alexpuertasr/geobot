/** Something GeoGuessr sent, kept as it arrived. */
export type RecordedPayload = {
  /** The response to a request, or a frame from the party or game socket. */
  source: "http" | "party" | "game";
  /** The frame's code, or the route's name (`startGame`, `gameState`…). */
  kind: string;
  /** When the SDK received it, as an ISO timestamp. */
  receivedAt: string;
  /** The HTTP status, for responses. */
  status?: number;
  /**
   * The JSON GeoGuessr sent — a party frame's payload, sent as a string,
   * parsed too — with access tokens redacted.
   */
  body: unknown;
};

export type Recording = {
  readonly payloads: readonly RecordedPayload[];
  /** Stops adding to it. Idempotent. */
  stop(): void;
};

const TOKEN_FIELDS = new Set(["accessToken", "chatAccessToken"]);

/**
 * Hands every payload the client receives to the recordings open at the
 * time. Without one open, it keeps nothing.
 */
export class Recorder {
  readonly #open = new Set<RecordedPayload[]>();

  start(): Recording {
    const payloads: RecordedPayload[] = [];
    this.#open.add(payloads);
    return { payloads, stop: () => this.#open.delete(payloads) };
  }

  record(payload: Omit<RecordedPayload, "receivedAt">) {
    if (this.#open.size === 0) return;

    const recorded = {
      ...payload,
      receivedAt: new Date().toISOString(),
      body: redacted(payload.body),
    };
    for (const payloads of this.#open) payloads.push(recorded);
  }
}

/** A deep copy of `body`, so nothing the SDK does later can change it. */
const redacted = (body: unknown): unknown =>
  body === undefined
    ? undefined
    : JSON.parse(
        JSON.stringify(body, (key, value) =>
          TOKEN_FIELDS.has(key) && value != null ? "[redacted]" : value,
        ),
      );
