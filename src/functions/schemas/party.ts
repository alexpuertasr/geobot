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
  expiresAt: z.string(),
  timestamp: z.string(),
  partySettings: z.object({
    allowedCommunication: z.string(),
    isolateInGameChat: z.boolean(),
    allowGuests: z.boolean(),
    allowSwitchingTeams: z.boolean(),
    maxPartySize: z.number(),
    masterControl: z.boolean(),
    masterControlAutoStartRounds: z.boolean(),
  }),
  gameSettings: z.object({
    forbidMoving: z.boolean(),
    forbidZooming: z.boolean(),
    forbidRotating: z.boolean(),
    guessMapType: z.string(),
    roundTime: z.number(),
    mapSlug: z.string(),
    roundCount: z.number(),
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
