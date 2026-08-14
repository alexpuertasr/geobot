import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import WebSocket from "ws";
import * as z from "zod";

import { logger } from "../logger";

import {
  type GameLobbyEvent,
  gameLobbyEvent,
} from "./schemas/game-lobby-event";

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
    logger.info("📡 Game lobby open", { gameId });
    socket.send(JSON.stringify({ code: "SubscribeToLobby", gameId, playerId }));
    heartbeat = setInterval(() => {
      socket.send(JSON.stringify({ code: "HeartBeat" }));
    }, 15000);
  });

  socket.on("close", (code) => {
    logger.warn("📡 Game lobby closed", { gameId, code });
  });

  socket.on("error", (error) => {
    logger.error("📡 Game lobby error", { gameId, error });
    emitter.emit("error", error);
  });

  socket.on("message", (raw) => {
    let data: unknown;
    try {
      data = JSON.parse(String(raw));
    } catch (error) {
      logger.error("📡 Game lobby frame unparsed", {
        stage: "json",
        reason: error instanceof Error ? error.message : String(error),
        payload: String(raw),
      });

      return;
    }

    try {
      const event = gameLobbyEvent.parse(data);
      logger.info(`🛰️ [Game] ${event.code} emitted`, { data });

      try {
        emitter.emit(event.code, event);
      } catch (error) {
        logger.error(`💥 [Game] Listener failed handling ${event.code}`, {
          error,
        });
      }
    } catch (error) {
      logger.error(`🛰️ [Game] Failed to parse event`, {
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
