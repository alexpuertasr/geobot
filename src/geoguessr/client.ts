import * as z from "zod";

import { logger } from "../logger";

import { type GameLobby, gameLobby } from "./game-lobby";
import { type PartyLobby, partyLobby } from "./party-lobby";
import {
  createLobbyRequest,
  createLobbyResponse,
} from "./schemas/create-lobby";
import {
  createPartyRequest,
  createPartyResponse,
} from "./schemas/create-party";
import { initialProps } from "./schemas/initial-props";
import type { Party } from "./schemas/party";

export type { GameLobby } from "./game-lobby";
export type { GameLobbyEvent } from "./schemas/game-lobby-event";

export type CreatePartyOptions = z.input<typeof createPartyRequest>;

export const createGeoClient = async ({ cookies }: { cookies: string }) => {
  let xClient: string | null = null;
  let currentParty: Party | null = null;
  let currentPartyLobby: PartyLobby | null = null;
  let currentGameId: string | null = null;

  const headers = (init?: RequestInit) => ({
    "content-type": "application/json",
    ...(xClient ? { "x-client": xClient } : {}),
    cookie: cookies,
    ...init?.headers,
  });

  const geoguessr = (path: string, init?: RequestInit) =>
    fetch(`https://www.geoguessr.com${path}`, {
      ...init,
      headers: headers(init),
    });

  const gameServer = (path: string, init?: RequestInit) =>
    fetch(`https://game-server.geoguessr.com${path}`, {
      ...init,
      headers: headers(init),
    });

  const connectPartyLobby = async (partyId: string) => {
    currentPartyLobby?.close();
    currentPartyLobby = null;

    const lobby = partyLobby({ cookies, xClient, partyId });

    try {
      await lobby.ready;
      currentPartyLobby = lobby;
    } catch (error) {
      logger.error("📡 Party lobby connection failed", { partyId, error });
      lobby.close();
    }
  };

  const refreshParty = async (): Promise<Party | null> => {
    currentParty = null;

    const response = await geoguessr("/party");
    const html = await response.text();
    const nextData =
      html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1] ??
      null;

    if (!nextData) {
      logger.warn("📄 __NEXT_DATA__ not found on party page", {
        status: response.status,
        url: response.url,
      });

      return null;
    }

    try {
      const data: unknown = JSON.parse(nextData);

      try {
        const page = initialProps.parse(data);
        logger.info("📄 Party page", { pageProps: page.props.pageProps });
        xClient = page.buildId ? `web-${page.buildId}` : null;
        currentParty = page.props.pageProps.initialParty ?? null;
        if (currentParty) {
          await connectPartyLobby(currentParty.partyId);
        }
      } catch (error) {
        logger.error("📄 Failed to parse party page props", {
          data,
          reason:
            error instanceof z.ZodError
              ? z.prettifyError(error)
              : String(error),
        });
      }
    } catch (error) {
      logger.error("📄 __NEXT_DATA__ unparsed", {
        stage: "json",
        reason: error instanceof Error ? error.message : String(error),
        payload: nextData,
      });
    }

    return currentParty;
  };

  await refreshParty();

  return {
    currentParty: () => currentParty,

    refreshParty: () => refreshParty(),

    disbandParty: async () => {
      await geoguessr("/api/v4/parties/v2/disband", { method: "DELETE" });
      currentParty = null;

      if (currentPartyLobby) {
        currentPartyLobby.close();
        currentPartyLobby = null;
      }
    },

    createParty: async (
      options?: CreatePartyOptions,
    ): Promise<Party | null> => {
      const response = await geoguessr("/api/v4/parties/v2", {
        method: "POST",
        body: JSON.stringify(createPartyRequest.parse(options)),
      });

      const body = await response.json();
      let party: Party | null = null;

      try {
        party = createPartyResponse.parse(body);
        await connectPartyLobby(party.partyId);
        currentParty = party;
      } catch (error) {
        logger.error("🎉 Unexpected create-party response", {
          status: response.status,
          body,
          reason:
            error instanceof z.ZodError
              ? z.prettifyError(error)
              : String(error),
        });
      }

      return party;
    },

    createGameLobby: async (): Promise<GameLobby | null> => {
      if (!currentParty) {
        logger.error("🎲 Cannot create a game lobby without a party");
        return null;
      }

      if (!currentPartyLobby) {
        logger.error("🎲 Cannot create a game lobby without a party lobby");
        return null;
      }

      const { partyId, owner } = currentParty;

      const response = await gameServer(`/api/parties/v2/${partyId}/lobby`, {
        method: "POST",
        body: JSON.stringify(createLobbyRequest.parse({})),
      });

      if (!response.ok) {
        logger.warn("🎲 Could not create game lobby", {
          status: response.status,
          body: await response.text(),
        });

        return null;
      }

      const body = await response.json();

      try {
        const { gameLobbyId } = createLobbyResponse.parse(body);
        currentGameId = gameLobbyId;

        logger.info("🎲 Game lobby created", { gameId: gameLobbyId });

        return gameLobby({
          cookies,
          xClient,
          gameId: gameLobbyId,
          playerId: owner.userId,
        });
      } catch (error) {
        logger.error("🎲 Unexpected create-lobby response", {
          status: response.status,
          body,
          reason:
            error instanceof z.ZodError
              ? z.prettifyError(error)
              : String(error),
        });

        return null;
      }
    },

    advanceRound: async (toRoundNumber: number): Promise<boolean> => {
      if (!currentGameId) {
        logger.error("🎲 Cannot advance round without a game lobby");
        return false;
      }

      const response = await gameServer(
        `/api/live-challenge/${currentGameId}/advance-round`,
        { method: "POST", body: JSON.stringify({ toRoundNumber }) },
      );

      if (response.ok) {
        logger.info(`🎲 Advanced to round ${toRoundNumber}`);
      } else {
        logger.warn(`🎲 Failed to advance to round ${toRoundNumber}`, {
          status: response.status,
          body: await response.text(),
        });
      }

      return response.ok;
    },
  };
};

export type GeoClient = Awaited<ReturnType<typeof createGeoClient>>;
