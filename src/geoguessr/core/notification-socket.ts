import type { ConnectionLostError } from "../errors";
import type { SdkLogger } from "../options";
import { isFinalClose } from "../protocol/close-codes";
import { messages } from "../protocol/messages";
import {
  type NotificationFrame,
  notificationFrameSchema,
} from "../protocol/schemas/frames";

import type { Unsubscribe } from "./emitter";
import type { WebClientIdentity } from "./identity";
import { parseJsonOr, parseOrLog } from "./parse";
import { NEVER_OPENED_MAX_ATTEMPTS } from "./socket/reconnect-state";
import { ReconnectingSocket } from "./socket/reconnecting-socket";

export type TopicSubscriber = {
  onFrame: (frame: NotificationFrame) => void;
  /** The socket reconnected: whatever it carried while down is lost. */
  onReconnect?: () => void;
  /** The socket gave up for good (taken over, or the session rejected). */
  onLost?: (error: ConnectionLostError) => void;
};

/**
 * GeoGuessr's notification socket, shared like the web client shares it: one
 * socket, ref-counted topic subscriptions, all re-sent after a reconnect.
 */
export class NotificationSocket {
  readonly #logger: SdkLogger;
  readonly #socket: ReconnectingSocket;
  readonly #topics = new Map<string, Set<TopicSubscriber>>();
  #opens = 0;

  constructor(options: {
    url: string;
    identity: WebClientIdentity;
    logger: SdkLogger;
  }) {
    this.#logger = options.logger;
    this.#socket = new ReconnectingSocket({
      ...options,
      name: "notification",
      onOpen: () => this.#onOpen(),
      onMessage: (data) => this.#dispatch(data),
      // Like the web client: once it has opened, it never gives up.
      shouldReconnect: ({ close, wasConnected, attempt }) =>
        !isFinalClose(close) &&
        (wasConnected || attempt <= NEVER_OPENED_MAX_ATTEMPTS),
      onLost: (error) =>
        this.#forEachSubscriber((subscriber) => subscriber.onLost?.(error)),
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
    this.#add(topic, subscriber);
    const unsubscribe = () => this.#remove(topic, subscriber);

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

  #add(topic: string, subscriber: TopicSubscriber) {
    const subscribers = this.#topics.get(topic) ?? new Set();
    if (subscribers.size === 0) {
      this.#topics.set(topic, subscribers);
      this.#send("subscribe", topic);
    }
    subscribers.add(subscriber);
  }

  #remove(topic: string, subscriber: TopicSubscriber) {
    const subscribers = this.#topics.get(topic);
    if (!subscribers?.delete(subscriber) || subscribers.size > 0) return;

    this.#topics.delete(topic);
    this.#send("unsubscribe", topic);
  }

  #onOpen() {
    this.#forEachTopic((topic) => this.#send("subscribe", topic));

    this.#opens += 1;
    if (this.#opens > 1) {
      this.#forEachSubscriber((subscriber) => subscriber.onReconnect?.());
    }
  }

  #dispatch(data: unknown) {
    const frame = parseOrLog(notificationFrameSchema, data, {
      logger: this.#logger,
      message: "🛰️ [Notification] Failed to parse frame",
    });
    if (!frame) return;

    this.#logger.info(`🛰️ [Notification] ${frame.code}`, { data });

    const parsedFrame = { ...frame, payload: parsePayload(frame.payload) };
    const subscribers = this.#topics.get(frame.topic ?? "") ?? [];
    for (const subscriber of [...subscribers]) subscriber.onFrame(parsedFrame);
  }

  #send(message: "subscribe" | "unsubscribe", topic: string) {
    this.#socket.send(messages[message](topic));
  }

  #forEachTopic(action: (topic: string) => void) {
    for (const topic of this.#topics.keys()) action(topic);
  }

  #forEachSubscriber(action: (subscriber: TopicSubscriber) => void) {
    for (const subscribers of this.#topics.values()) {
      for (const subscriber of subscribers) action(subscriber);
    }
  }
}

/** Party payloads arrive as a JSON string. */
const parsePayload = (payload: unknown) =>
  typeof payload === "string" ? parseJsonOr(payload, payload) : payload;
