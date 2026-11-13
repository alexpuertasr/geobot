import WebSocket from "ws";

import { messages } from "../../protocol/messages";

/** Both sockets expect a `HeartBeat` this often. */
const INTERVAL_MS = 15_000;
/** Neither answers the heartbeat, but both answer pings within ~0.4s. */
const PONG_TIMEOUT_MS = 10_000;

/**
 * Keeps a socket alive the way the web client does, and — on top — pings it
 * to catch connections that died without a close frame.
 */
export class Heartbeat {
  #interval: ReturnType<typeof setInterval> | undefined;
  #pongTimeout: ReturnType<typeof setTimeout> | undefined;

  start(socket: WebSocket, onDead: () => void) {
    this.stop();
    socket.on("pong", () => clearTimeout(this.#pongTimeout));

    this.#interval = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;

      socket.send(JSON.stringify(messages.heartbeat()));
      socket.ping();
      this.#expectPong(onDead);
    }, INTERVAL_MS);
  }

  stop() {
    clearInterval(this.#interval);
    clearTimeout(this.#pongTimeout);
  }

  #expectPong(onDead: () => void) {
    clearTimeout(this.#pongTimeout);
    this.#pongTimeout = setTimeout(onDead, PONG_TIMEOUT_MS);
  }
}
