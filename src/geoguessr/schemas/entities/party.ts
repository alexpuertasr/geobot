import * as z from "zod";

import { member } from "./member";

export type Party = z.infer<typeof party>;

export const party = z.object({
  partyId: z.string(),
  owner: member,
  lobbyId: z.string().nullable(),
  gameState: z.string(),
  gameType: z.string(),
  chatAccessToken: z.string(),
  bannedPlayerIds: z.array(z.string()).nullable(),
  mutedPlayerIds: z.array(z.string()),
  expiresAt: z.union([z.number(), z.string()]),
  timestamp: z.string().nullish(),
  partySettings: z.object({
    allowedCommunication: z.string(),
    isolateInGameChat: z.boolean(),
    allowGuests: z.boolean(),
    allowSwitchingTeams: z.boolean(),
    maxPartySize: z.number(),
    masterControl: z.boolean(),
    masterControlAutoStartRounds: z.boolean(),
    hideJoinInfo: z.boolean().nullish(),
  }),
  maxAllowedPartySize: z.number().nullish(),
  gameSettings: z.object({
    forbidMoving: z.boolean(),
    forbidZooming: z.boolean(),
    forbidRotating: z.boolean(),
    guessMapType: z.string(),
    roundTime: z.number(),
    mapSlug: z.string(),
    roundCount: z.number(),
    initialHealth: z.number().nullish(),
    individualInitialHealth: z.boolean().nullish(),
    initialHealthTeamOne: z.number().nullish(),
    initialHealthTeamTwo: z.number().nullish(),
    timeAfterGuess: z.number().nullish(),
    multiplierIncrement: z.number().nullish(),
    disableHealing: z.boolean().nullish(),
    countAllGuesses: z.boolean().nullish(),
    maxRoundTime: z.number().nullish(),
    maxNumberOfRounds: z.number().nullish(),
    roundsWithoutDamageMultiplier: z.number().nullish(),
    roundWinMultiplierIncrement: z.number().nullish(),
    blinkMode: z.boolean().nullish(),
    blinkTimeTeamOne: z.number().nullish(),
    blinkTimeTeamTwo: z.number().nullish(),
    powerUpRoadLabels: z.boolean().nullish(),
    powerUpScoreMarker: z.boolean().nullish(),
    powerUpSkipRound: z.boolean().nullish(),
    powerUpUpgradeMovement: z.boolean().nullish(),
  }),
  joinCode: z.object({
    code: z.string(),
    resourceType: z.string(),
    resourceId: z.string(),
    expires: z.string(),
  }),
  isCommunity: z.boolean(),
  communitySettings: z
    .object({
      language: z.string(),
      gameModes: z.array(z.string()),
      vibe: z.string(),
    })
    .nullish(),
  isHostLess: z.boolean(),
});
