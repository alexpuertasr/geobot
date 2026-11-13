import * as z from "zod";

import { type ShapeKit, type ShapeOutput, shape } from "./shape";

/** The party game modes GeoGuessr's web client knows. */
export const PARTY_GAME_TYPES = [
  "LiveChallenge",
  "Quiz",
  "Bullseye",
  "Duels",
  "TeamDuels",
  "BattleRoyaleCountries",
  "BattleRoyaleDistance",
  "PointRush",
  "Tournament",
] as const;

const member = (k: ShapeKit) =>
  k.object({
    userId: k.need(z.string()),
    nick: k.need(z.string()),
    isGuest: k.keep(z.boolean()),
    isPresent: k.keep(z.boolean()),
    isPlaying: k.keep(z.boolean()),
    /** Not on the party page. */
    isInCurrentGame: k.maybe(z.boolean()),
    isBenched: k.keep(z.boolean()),
    benchReason: k.unseen(),
    isEligibleAsOwner: k.keep(z.boolean()),
    team: k.keep(z.string().nullable()),
    victories: k.keep(z.number()),
    flair: k.keep(z.number()),
    pin: k.keep(z.string()),
    fullBodyPin: k.keep(z.string()),
    clientType: k.keep(z.string()),
    club: k.unseen(),
    /** Not on the owner a new party reports. */
    sessionId: k.maybe(z.string().nullable()),
  });

const party = (k: ShapeKit) =>
  k.object({
    partyId: k.need(z.string()),
    owner: k.need(member(k)),
    /** The game the party is attached to. */
    lobbyId: k.keep(z.string().nullable()),
    /** `Finished` describes the last game; a new party starts at `NoGame`. */
    gameState: k.need(k.oneOf(["NoGame", "Ongoing", "Finished"])),
    gameType: k.keep(k.oneOf(PARTY_GAME_TYPES)),
    gameSettings: k.need(
      k.object({
        roundCount: k.need(z.number()),
        roundTime: k.need(z.number()),
        mapSlug: k.keep(z.string()),
        guessMapType: k.keep(z.string()),
        forbidMoving: k.keep(z.boolean()),
        forbidZooming: k.keep(z.boolean()),
        forbidRotating: k.keep(z.boolean()),
        /*
         * The rest set up the other modes. None is on the party page, and each
         * mode's only once the party has been set up for it.
         */
        initialHealth: k.maybe(z.number()),
        individualInitialHealth: k.maybe(z.boolean()),
        initialHealthTeamOne: k.maybe(z.number()),
        initialHealthTeamTwo: k.maybe(z.number()),
        timeAfterGuess: k.maybe(z.number()),
        multiplierIncrement: k.maybe(z.number()),
        disableHealing: k.maybe(z.boolean()),
        countAllGuesses: k.maybe(z.boolean()),
        maxRoundTime: k.maybe(z.number()),
        maxNumberOfRounds: k.maybe(z.number()),
        roundsWithoutDamageMultiplier: k.maybe(z.number()),
        roundWinMultiplierIncrement: k.maybe(z.number()),
        blinkMode: k.maybe(z.boolean()),
        blinkTimeTeamOne: k.maybe(z.number()),
        blinkTimeTeamTwo: k.maybe(z.number()),
        powerUpSkipRound: k.maybe(z.boolean()),
        powerUpRoadLabels: k.maybe(z.boolean()),
        powerUpUpgradeMovement: k.maybe(z.boolean()),
        powerUpScoreMarker: k.maybe(z.boolean()),
        pointRushMaxRoundTime: k.maybe(z.number()),
        pointRushTimeAfterGuess: k.maybe(z.number()),
        pointRushHasFinal: k.maybe(z.boolean()),
        pointRushPointsToWin: k.maybe(z.number()),
      }),
    ),
    partySettings: k.keep(
      k.object({
        allowedCommunication: k.keep(z.string()),
        isolateInGameChat: k.keep(z.boolean()),
        allowGuests: k.keep(z.boolean()),
        allowSwitchingTeams: k.keep(z.boolean()),
        maxPartySize: k.keep(z.number()),
        masterControl: k.keep(z.boolean()),
        masterControlAutoStartRounds: k.keep(z.boolean()),
        /** Not on the party page. */
        hideJoinInfo: k.maybe(z.boolean()),
      }),
    ),
    joinCode: k.need(
      k.object({
        code: k.need(z.string()),
        resourceType: k.keep(z.string()),
        resourceId: k.keep(z.string()),
        expires: k.keep(z.string()),
      }),
    ),
    /** Epoch milliseconds on the party page, an ISO string from the API. */
    expiresAt: k.keep(z.union([z.number(), z.string()])),
    /** Not on the party page. */
    timestamp: k.maybe(z.string()),
    chatAccessToken: k.keep(z.string()),
    bannedPlayerIds: k.keep(z.array(z.string()).nullable()),
    mutedPlayerIds: k.keep(z.array(z.string())),
    /** Not on the party page. */
    maxAllowedPartySize: k.maybe(z.number()),
    isHostLess: k.keep(z.boolean()),
    isCommunity: k.keep(z.boolean()),
    communitySettings: k.keep(
      k.object({
        language: k.keep(z.string()),
        gameModes: k.keep(z.array(z.string())),
        vibe: k.keep(z.string()),
      }),
    ),
  });

export const memberShape = shape("PartyMember", member);
export type MemberData = ShapeOutput<typeof memberShape>;

export const partyShape = shape("Party", party);
export type PartyData = ShapeOutput<typeof partyShape>;

/** Its members are read one by one: one odd member mustn't hide the rest. */
export const memberListShape = shape("PartyMemberList", (k) =>
  k.object({
    /** Not on the party page. */
    partyId: k.maybe(z.string()),
    members: k.need(z.array(z.unknown().optional())),
    totalCount: k.keep(z.number()),
  }),
);

export const gameStartedShape = shape("PartyGameStarted", (k) =>
  k.object({
    partyId: k.keep(z.string()),
    gameType: k.keep(k.oneOf(PARTY_GAME_TYPES)),
    gameId: k.keep(z.string()),
    lobbyId: k.keep(z.string()),
    players: k.keep(z.array(z.string())),
    nodeId: k.keep(z.string()),
  }),
);

export const hostEditingSettingsShape = shape("PartyHostEditingSettings", (k) =>
  k.object({
    partyId: k.keep(z.string()),
    settingKey: k.keep(z.string()),
    isEditing: k.keep(z.boolean()),
  }),
);

/** The server-rendered `__NEXT_DATA__` of `/party`; only its page props are described. */
export const partyPageShape = shape("PartyPage", (k) =>
  z.looseObject({
    buildId: k.keep(z.string()),
    props: z.looseObject({
      pageProps: k.object({
        /** 401 when the session cookies are no longer valid. */
        statusCode: k.maybe(z.number()),
        /** Left out when the account has no party. */
        initialParty: k.maybe(z.unknown()),
        initialMemberInfo: k.maybe(z.unknown()),
      }),
    }),
  }),
);

/** A player as the game server describes one. */
const lobbyPlayer = (k: ShapeKit) =>
  k.object({
    playerId: k.keep(z.string()),
    nick: k.keep(z.string()),
    isGuest: k.keep(z.boolean()),
    isVerified: k.keep(z.boolean()),
    countryCode: k.keep(z.string()),
    flair: k.keep(z.number()),
    avatarPath: k.keep(z.string()),
    avatar: k.keep(k.object({ fullBodyPath: k.keep(z.string()) })),
    borderUrl: k.keep(z.string().nullable()),
    level: k.keep(z.number()),
    titleTierId: k.keep(z.number()),
    division: k.keep(z.string()),
    performanceStreak: k.keep(z.string()),
    rank: k.keep(
      k.object({
        rank: k.unseen(),
        division: k.keep(
          k.object({
            id: k.keep(z.number()),
            divisionId: k.keep(z.number()),
            tierId: k.keep(z.number()),
          }),
        ),
      }),
    ),
    competitive: k.keep(
      k.object({
        rating: k.keep(z.number()),
        division: k.keep(
          k.object({
            type: k.keep(z.number()),
            startRating: k.keep(z.number()),
            endRating: k.keep(z.number()),
          }),
        ),
      }),
    ),
    team: k.keep(z.string()),
    club: k.unseen(),
  });

/** The game lobby the start request answers with. */
export const startGameResponseShape = shape("GameLobby", (k) =>
  k.object({
    gameLobbyId: k.need(z.string()),
    partyId: k.keep(z.string()),
    gameType: k.keep(k.oneOf(PARTY_GAME_TYPES)),
    title: k.keep(z.string()),
    type: k.keep(z.string()),
    status: k.keep(z.string()),
    visibility: k.keep(z.string()),
    owner: k.keep(z.string()),
    host: k.keep(lobbyPlayer(k)),
    hostParticipates: k.keep(z.boolean()),
    playerIds: k.keep(z.array(z.string())),
    players: k.keep(z.array(lobbyPlayer(k))),
    teams: k.keep(z.array(z.unknown().optional())),
    numPlayersJoined: k.keep(z.number()),
    totalSpots: k.keep(z.number()),
    numOpenSpots: k.keep(z.number()),
    minPlayersRequired: k.keep(z.number()),
    gameOptions: k.keep(
      k.object({
        mapSlug: k.keep(z.string()),
        roundCount: k.keep(z.number()),
        roundTime: k.keep(z.number()),
        guessMapType: k.keep(z.string()),
        forbidMoving: k.keep(z.boolean()),
        forbidZooming: k.keep(z.boolean()),
        forbidRotating: k.keep(z.boolean()),
      }),
    ),
    mapName: k.keep(z.string()),
    isAutoStarted: k.keep(z.boolean()),
    canBeStartedManually: k.keep(z.boolean()),
    isRated: k.keep(z.boolean()),
    isSinglePlayer: k.keep(z.boolean()),
    competitionId: k.keep(z.string()),
    competitiveGameMode: k.keep(z.string()),
    gameContext: k.keep(z.string()),
    allowedCommunication: k.keep(z.string()),
    groupEventId: k.keep(z.string()),
    quizId: k.keep(z.string()),
    tripId: k.keep(z.string()),
    shareLink: k.keep(z.string()),
    closingTime: k.keep(z.string()),
    createdAt: k.keep(z.string()),
    timestamp: k.keep(z.string()),
    blueprintId: k.unseen(),
    tournament: k.unseen(),
    accessToken: k.unseen(),
  }),
);

export type CreatePartyOptions = z.input<typeof createPartyRequestSchema>;

/** What the SDK sends, so a plain schema: there's nothing to drift. */
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
