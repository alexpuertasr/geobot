import { randomUUID } from "node:crypto";

import WebSocket from "ws";

import { logger } from "../logger";

export type PartyLobby = {
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
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const params = new URLSearchParams({
    ...(xClient ? { c: xClient } : {}),
    tabId: randomUUID(),
  });

  const socket = new WebSocket(`wss://api.geoguessr.com/ws?${params}`, {
    headers: { cookie: cookies, origin: "https://www.geoguessr.com" },
  });

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
  });

  socket.on("close", (code) => {
    logger.warn("📡 Party lobby closed", { partyId, code });
  });

  socket.on("error", (error) => {
    logger.error("📡 Party lobby error", { partyId, error });
  });

  socket.on("message", (raw) => {
    const code =
      String(raw).match(/"code"\s*:\s*"([^"]+)"/)?.[1] ?? String(raw);
    logger.info(`📡 Party lobby frame ${code}`, { partyId });
  });

  return {
    close: () => {
      if (heartbeat) clearInterval(heartbeat);
      socket.close();
    },
  };
};
