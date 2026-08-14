import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import WebSocket from "ws";
import * as z from "zod";

import { logger } from "../logger";

import {
  type PartyLobbyEvent,
  partyLobbyEvent,
} from "./schemas/party-lobby-event";

export type PartyLobby = {
  ready: Promise<void>;
  on(
    code: PartyLobbyEvent["code"],
    listener: (event: PartyLobbyEvent) => void,
  ): void;
  close(): void;
};

export const partyLobby = ({
  cookies,
  xClient,
  partyId,
}: {
  cookies: string;
  xClient: string | null;
  partyId: string;
}): PartyLobby => {
  const emitter = new EventEmitter();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const params = new URLSearchParams({
    ...(xClient ? { c: xClient } : {}),
    tabId: randomUUID(),
  });

  const socket = new WebSocket(`wss://api.geoguessr.com/ws?${params}`, {
    headers: { cookie: cookies, origin: "https://www.geoguessr.com" },
  });

  const ready = new Promise<void>((resolve, reject) => {
    socket.once("open", () => {
      logger.info("📡 Party lobby open", { partyId });
      socket.send(
        JSON.stringify({
          code: "Subscribe",
          topic: `partyv2:${partyId}`,
          client: "web",
        }),
      );
      heartbeat = setInterval(() => {
        socket.send(JSON.stringify({ code: "HeartBeat" }));
      }, 15000);
      resolve();
    });
    socket.once("error", reject);
  });

  socket.on("close", (code) => {
    logger.warn("📡 Party lobby closed", { partyId, code });
  });

  socket.on("error", (error) => {
    logger.error("📡 Party lobby error", { partyId, error });
  });

  socket.on("message", (raw) => {
    let data: unknown;
    try {
      data = JSON.parse(String(raw));
    } catch (error) {
      logger.error("📡 Party lobby frame unparsed", {
        stage: "json",
        reason: error instanceof Error ? error.message : String(error),
        payload: String(raw),
      });

      return;
    }

    try {
      const event = partyLobbyEvent.parse(data);
      logger.info(`🛰️ [Party] ${event.code} emitted`, { partyId, data });

      try {
        emitter.emit(event.code, event);
      } catch (error) {
        logger.error(`💥 [Party] Listener failed handling ${event.code}`, {
          error,
        });
      }
    } catch (error) {
      logger.error("🛰️ [Party] Failed to parse event", {
        partyId,
        data,
        reason:
          error instanceof z.ZodError ? z.prettifyError(error) : String(error),
      });
    }
  });

  return {
    ready,
    on: (code, listener) => {
      emitter.on(code, listener);
    },
    close: () => {
      if (heartbeat) clearInterval(heartbeat);
      socket.close();
    },
  };
};
