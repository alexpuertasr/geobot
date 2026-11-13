import { type ConnectionError, GeoGuessrError } from "../errors";
import type { SdkLogger } from "../options";
import { messages } from "../protocol/messages";
import {
  type NotificationFrame,
  notificationFrameShape,
} from "../protocol/schemas/frames";

import type { Unsubscribe } from "./emitter";
import type { WebClientIdentity } from "./identity";
import { parseJsonOr } from "./parse";
import type { PayloadReader } from "./payload-reader";
import type { Recorder } from "./recorder";
import { ReconnectingSocket } from "./socket/reconnecting-socket";

export type TopicSubscriber = {
  onFrame: (frame: NotificationFrame) => void;
  /** The socket reconnected: whatever it carried while down is lost. */
  onReconnect?: () => void;
  /** The socket gave up for good (taken over, or the session rejected). */
  onLost?: (error: ConnectionError) => void;
};

/**
 * GeoGuessr's notification socket: one per client, one subscriber per topic,
 * every subscription re-sent after a reconnect. Like the web client's, once
 * it has opened it never gives up.
 */
export class NotificationSocket {
  readonly #logger: SdkLogger;
  readonly #reader: PayloadReader;
  readonly #recorder: Recorder;
  readonly #socket: ReconnectingSocket;
  readonly #subscribers = new Map<string, TopicSubscriber>();
  #opens = 0;

  constructor({
    reader,
    recorder,
    ...options
  }: {
    url: string;
    identity: WebClientIdentity;
    reader: PayloadReader;
    recorder: Recorder;
    logger: SdkLogger;
  }) {
    this.#logger = options.logger;
    this.#reader = reader;
    this.#recorder = recorder;
    this.#socket = new ReconnectingSocket({
      ...options,
      name: "notification",
      onOpen: () => this.#onOpen(),
      onMessage: (data) => this.#dispatch(data),
      shouldReconnect: () => true,
      onLost: (error) => {
        for (const subscriber of this.#subscribers.values()) {
          subscriber.onLost?.(error);
        }
      },
    });
  }

  /**
   * Resolves once the socket is open and the `Subscribe` sent; GeoGuessr
   * never acknowledges a party subscription.
   */
  async subscribe(
    topic: string,
    subscriber: TopicSubscriber,
  ): Promise<Unsubscribe> {
    if (this.#subscribers.has(topic)) {
      throw new GeoGuessrError(`Already subscribed to ${topic}`);
    }
    this.#subscribers.set(topic, subscriber);
    this.#socket.send(messages.subscribe(topic));

    const unsubscribe = () => {
      if (this.#subscribers.get(topic) !== subscriber) return;
      this.#subscribers.delete(topic);
      this.#socket.send(messages.unsubscribe(topic));
    };

    try {
      await this.#socket.connect();
    } catch (error) {
      unsubscribe();
      throw error;
    }
    return unsubscribe;
  }

  close() {
    return this.#socket.close();
  }

  #onOpen() {
    for (const topic of this.#subscribers.keys()) {
      this.#socket.send(messages.subscribe(topic));
    }

    this.#opens += 1;
    if (this.#opens === 1) return;
    for (const subscriber of this.#subscribers.values()) {
      subscriber.onReconnect?.();
    }
  }

  #dispatch(data: unknown) {
    const frame = this.#reader.read(notificationFrameShape, data);
    const payload = parsePayload(frame?.payload);
    this.#recorder.record({
      source: "party",
      kind: frame?.code ?? "unreadable",
      // As sent, not as read: reading drops whatever drifted.
      body: frame ? { ...(data as object), payload } : data,
    });
    if (!frame) return;

    this.#logger.info(`🛰️ [Notification] ${frame.code}`, { data });
    this.#subscribers.get(frame.topic ?? "")?.onFrame({ ...frame, payload });
  }
}

/** Party payloads arrive as a JSON string. */
const parsePayload = (payload: unknown) =>
  typeof payload === "string" ? parseJsonOr(payload, payload) : payload;
