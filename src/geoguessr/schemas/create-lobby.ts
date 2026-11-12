import * as z from "zod";

import { player } from "./entities/player";

export const createLobbyRequest = z.object({}).prefault({});

export const createLobbyResponse = z
  .object({
    gameLobbyId: z.string(),
    partyId: z.string(),
    gameType: z.string(),
    type: z.string(),
    status: z.string(),
    visibility: z.string(),
    title: z.string(),
    mapName: z.string(),
    gameContext: z.string(),
    competitiveGameMode: z.string(),
    allowedCommunication: z.string(),
    shareLink: z.string(),
    owner: z.string(),
    host: player,
    hostParticipates: z.boolean(),
    playerIds: z.array(z.string()),
    players: z.array(player),
    numPlayersJoined: z.number(),
    minPlayersRequired: z.number(),
    totalSpots: z.number(),
    numOpenSpots: z.number(),
    isAutoStarted: z.boolean(),
    canBeStartedManually: z.boolean(),
    isRated: z.boolean(),
    isSinglePlayer: z.boolean(),
    gameOptions: z
      .object({
        forbidMoving: z.boolean(),
        forbidZooming: z.boolean(),
        forbidRotating: z.boolean(),
        mapSlug: z.string(),
        roundTime: z.number(),
        roundCount: z.number(),
        guessMapType: z.string(),
      })
      .partial(),
    createdAt: z.string(),
    closingTime: z.string(),
    timestamp: z.string(),
  })
  .partial()
  .required({ gameLobbyId: true });
