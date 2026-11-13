import * as z from "zod";

import { lenientEnum } from "./lenient";

export type MemberData = z.infer<typeof memberSchema>;

export const memberSchema = z
  .object({
    userId: z.string(),
    nick: z.string(),
    isPresent: z.boolean().nullish(),
    isPlaying: z.boolean().nullish(),
    isInCurrentGame: z.boolean().nullish(),
    isBenched: z.boolean().nullish(),
  })
  .loose();

export type PartyData = z.infer<typeof partySchema>;

export const partySchema = z
  .object({
    partyId: z.string(),
    owner: memberSchema,
    /** The game the party is attached to. */
    lobbyId: z.string().nullish(),
    /** `Finished` describes the last game; a new party starts at `NoGame`. */
    gameState: lenientEnum<"NoGame" | "Ongoing" | "Finished">(),
    gameType: z.string().nullish(),
    /** Epoch milliseconds on the party page, an ISO string from the API. */
    expiresAt: z.union([z.number(), z.string()]).nullish(),
    gameSettings: z
      .object({ roundCount: z.number(), roundTime: z.number() })
      .loose(),
    joinCode: z.object({ code: z.string() }).loose(),
  })
  .loose();

export const memberListSchema = z
  .object({ members: z.array(memberSchema) })
  .loose();

/** A member list whose members are checked one by one, not all or nothing. */
export const rawMemberListSchema = z
  .object({ members: z.array(z.unknown()) })
  .loose();

/** The server-rendered `__NEXT_DATA__` of `/party`. */
export const partyPageSchema = z.object({
  buildId: z.string().nullish(),
  props: z.object({
    pageProps: z
      .object({
        /** 401 when the session cookies are no longer valid. */
        statusCode: z.number().nullish(),
        initialParty: z.unknown().optional(),
        initialMemberInfo: z.unknown().optional(),
      })
      .loose(),
  }),
});

export type CreatePartyOptions = z.input<typeof createPartyRequestSchema>;

export const createPartyRequestSchema = z
  .object({
    gameType: z.literal("LiveChallenge").default("LiveChallenge"),
    gameSettings: z
      .object({
        forbidMoving: z.boolean().default(false),
        forbidRotating: z.boolean().default(false),
        forbidZooming: z.boolean().default(false),
        guessMapType: z.literal("roadmap").default("roadmap"),
        mapSlug: z.literal("world").default("world"),
        masterControl: z.boolean().default(false),
        masterControlAutoStartRounds: z.boolean().default(false),
        roundCount: z.int().min(1).default(5),
        roundTime: z.int().min(10).default(90),
      })
      .prefault({}),
    wasCustomized: z.boolean().default(false),
  })
  .prefault({});

export const startGameResponseSchema = z
  .object({ gameLobbyId: z.string() })
  .loose();
