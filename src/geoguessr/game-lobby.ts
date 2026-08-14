import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import WebSocket from "ws";
import * as z from "zod";

import {
  type GameLobbyEvent,
  gameLobbyEvent,
} from "../functions/schemas/game-lobby-event";
import { logger } from "../logger";

export type GameLobby = {
  on(
    code: GameLobbyEvent["code"],
    listener: (event: GameLobbyEvent) => void,
  ): void;
  onError(listener: (error: Error) => void): void;
  close(): void;
};

export const gameLobby = ({
  cookies,
  xClient,
  gameId,
  playerId,
}: {
  cookies: string;
  xClient: string | null;
  gameId: string;
  playerId: string;
}): GameLobby => {
  const emitter = new EventEmitter();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const params = new URLSearchParams({
    ...(xClient ? { c: xClient } : {}),
    tabId: randomUUID(),
    attempt: "1",
    visibility: "visible",
  });

  const socket = new WebSocket(`wss://game-server.geoguessr.com/ws?${params}`, {
    headers: { cookie: cookies, origin: "https://www.geoguessr.com" },
  });

  socket.on("open", () => {
    logger.info("📡 WebSocket open", { gameId });
    socket.send(JSON.stringify({ code: "SubscribeToLobby", gameId, playerId }));
    heartbeat = setInterval(() => {
      socket.send(JSON.stringify({ code: "HeartBeat" }));
    }, 15000);
  });

  socket.on("close", (code) => {
    logger.warn("📡 WebSocket closed", { gameId, code });
  });

  socket.on("error", (error) => {
    logger.error("📡 WebSocket error", { gameId, error });
    emitter.emit("error", error);
  });

  socket.on("message", (raw) => {
    let data: unknown;
    try {
      data = JSON.parse(String(raw));
    } catch (error) {
      logger.error("📡 WebSocket frame unparsed", {
        stage: "json",
        reason: error instanceof Error ? error.message : String(error),
        payload: String(raw),
      });

      return;
    }

    try {
      const event = gameLobbyEvent.parse(data);
      logger.info(`🛰️ ${event.code} emitted`, { data });

      try {
        emitter.emit(event.code, event);
      } catch (error) {
        logger.error(`💥 Listener failed handling ${event.code}`, { error });
      }
    } catch (error) {
      logger.error(`🛰️ Failed to parse session event`, {
        data,
        reason:
          error instanceof z.ZodError ? z.prettifyError(error) : String(error),
      });
    }
  });

  return {
    on: (code, listener) => {
      emitter.on(code, listener);
    },
    onError: (listener) => {
      emitter.on("error", listener);
    },
    close: () => {
      if (heartbeat) clearInterval(heartbeat);
      socket.close();
    },
  };
};
