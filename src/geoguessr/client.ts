import * as z from "zod";

import { logger } from "@/logger";

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
import type { Member } from "./schemas/entities/member";
import { type Party, party } from "./schemas/entities/party";
import { partyMembersResponse } from "./schemas/party-members";

export type { GameLobby } from "./game-lobby";
export type { LiveChallengeLeaderboardEntry } from "./schemas/entities/live-challenge/leaderboards";
export type { LiveChallengeState } from "./schemas/entities/live-challenge/state";
export type {
  GameLobbyEvent,
  GameLobbyEventOf,
} from "./schemas/game-lobby-event";

export type CreatePartyOptions = z.input<typeof createPartyRequest>;

export const createGeoClient = async ({ cookies }: { cookies: string }) => {
  let xClient: string | null = null;
  let currentParty: Party | null = null;
  let currentMembers: Member[] = [];
  let currentPartyLobby: PartyLobby | null = null;
  let currentGameId: string | null = null;

  const headers = (init?: RequestInit) => ({
    "content-type": "application/json",
    ...(xClient ? { "x-client": xClient } : {}),
    cookie: cookies,
    ...init?.headers,
  });

  const request = async (base: string, path: string, init?: RequestInit) => {
    const response = await fetch(`${base}${path}`, {
      signal: AbortSignal.timeout(10000),
      ...init,
      headers: headers(init),
    });

    const text = await response.clone().text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    logger.info(`🌐 ${init?.method ?? "GET"} ${path}`, {
      status: response.status,
      url: response.url,
      body,
    });

    return response;
  };

  const geoguessr = (path: string, init?: RequestInit) =>
    request("https://www.geoguessr.com", path, init);

  const gameServer = (path: string, init?: RequestInit) =>
    request("https://game-server.geoguessr.com", path, init);

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

  const loadXClient = async () => {
    const response = await geoguessr("/party");
    const buildId = (await response.text()).match(
      /__GEOGUESSR_BUILD_ID__\s*=\s*"([^"]+)"/,
    )?.[1];

    if (!buildId) {
      logger.warn("📄 Build id not found on party page", {
        status: response.status,
        url: response.url,
      });
    }

    xClient = buildId ? `web-${buildId}` : null;
  };

  const loadParty = async () => {
    const response = await geoguessr("/api/v4/parties/v2/active");

    if (response.status === 204) return;

    if (!response.ok) {
      logger.warn("🎉 Could not fetch the active party", {
        status: response.status,
      });

      return;
    }

    const body = await response.json();
    const active = party.safeParse(body);

    if (!active.success) {
      logger.error("🎉 Unexpected active-party response", {
        body,
        reason: z.prettifyError(active.error),
      });

      return;
    }

    currentParty = active.data;
    currentMembers = await loadMembers(active.data);
    await connectPartyLobby(active.data.partyId);
  };

  const loadMembers = async ({ partySettings }: Party): Promise<Member[]> => {
    const response = await geoguessr(
      `/api/v4/parties/v2/members?page=0&count=${partySettings.maxPartySize}`,
    );

    if (!response.ok) {
      logger.warn("🎉 Could not fetch party members", {
        status: response.status,
      });

      return [];
    }

    const body = await response.json();
    const members = partyMembersResponse.safeParse(body);

    if (!members.success) {
      logger.error("🎉 Unexpected party-members response", {
        body,
        reason: z.prettifyError(members.error),
      });

      return [];
    }

    return members.data.members;
  };

  await loadXClient();
  await loadParty();

  return {
    currentParty: () => currentParty,

    currentMembers: () => currentMembers,

    disbandParty: async () => {
      const response = await geoguessr("/api/v4/parties/v2/disband", {
        method: "DELETE",
      });

      if (!response.ok) {
        logger.warn("🎉 Could not disband party", {
          status: response.status,
          body: await response.text(),
        });
      }

      currentParty = null;
      currentMembers = [];
      currentGameId = null;

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

      if (!response.ok) {
        logger.error("🎉 Could not create party", {
          status: response.status,
          body: await response.text(),
        });

        return null;
      }

      const body = await response.json();
      let party: Party | null = null;

      try {
        party = createPartyResponse.parse(body);
        await connectPartyLobby(party.partyId);
        currentParty = party;
        currentMembers = [party.owner];
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
