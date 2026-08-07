import * as z from "zod";

export type Party = z.infer<typeof party>;
export type PartyMember = z.infer<typeof partyMember>;
export type InitialProps = z.infer<typeof initialProps>;

const partyMember = z.object({
  nick: z.string(),
  flair: z.number(),
  pin: z.string().nullish(),
  fullBodyPin: z.string().nullish(),
  userId: z.string(),
  team: z.string().nullable(),
  isGuest: z.boolean(),
  isPresent: z.boolean(),
  isPlaying: z.boolean(),
  isBenched: z.boolean(),
  isEligibleAsOwner: z.boolean(),
  victories: z.number(),
  clientType: z.string(),
  club: z.unknown(),
});

const party = z.object({
  partyId: z.string(),
  owner: partyMember,
  lobbyId: z.string().nullable(),
  gameState: z.string(),
  gameType: z.string(),
  chatAccessToken: z.string(),
  bannedPlayerIds: z.array(z.string()),
  mutedPlayerIds: z.array(z.string()),
  expiresAt: z.number(),
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

export const initialProps = z.object({
  props: z.object({
    pageProps: z.object({
      party,
      currentMember: partyMember.nullish(),
      initialMemberInfo: z.object({
        members: z.array(partyMember),
        totalCount: z.number(),
      }),
    }),
  }),
});
