import * as z from "zod";

import { type ShapeOutput, shape } from "./shape";

/** A notification frame; party frames carry their payload as a JSON string. */
export const notificationFrameShape = shape("NotificationFrame", (k) =>
  k.object({
    code: k.need(
      k.oneOf([
        "PartyUpdated",
        "PartyMemberListUpdated",
        "PartyGameStarted",
        "PartyHostEditingSettings",
        "PartyDisbanded",
      ]),
    ),
    topic: k.keep(z.string()),
    // Each code's payload has a shape of its own.
    payload: z.unknown().optional(),
    client: k.keep(z.string()),
    timestamp: k.keep(z.string()),
    accessToken: k.unseen(),
  }),
);
export type NotificationFrame = ShapeOutput<typeof notificationFrameShape>;

/** All game frames share one envelope; other game modes' fields are `null`. */
export const gameFrameShape = shape("GameFrame", (k) =>
  k.object({
    code: k.need(
      k.oneOf([
        "ConnectionOpened",
        "ConnectionClosed",
        "LiveChallengeStarted",
        "LiveChallengeRoundStarting",
        "LiveChallengeRoundStarted",
        "LiveChallengeRoundEnded",
        "LiveChallengeLeaderboardUpdate",
        "LiveChallengeFinished",
        "GameAborted",
        "LobbyClosed",
      ]),
    ),
    gameId: k.keep(z.string()),
    /** Whose connection a `ConnectionOpened`/`ConnectionClosed` is about. */
    playerId: k.keep(z.string().nullable()),
    timestamp: k.keep(z.string()),
    liveChallenge: k.keep(
      k
        .object({
          // Each has a shape of its own.
          state: z.unknown().optional(),
          leaderboards: z.unknown().optional(),
          /** When the results breakdown can be fetched; on `LiveChallengeFinished`. */
          gameBreakdownAvailableAfter: k.keep(z.string().nullable()),
          aggregatedAnswerStats: k.unseen(),
          guess: k.unseen(),
          playerId: k.unseen(),
        })
        .nullable(),
    ),
    payload: k.unseen(),
    lobby: k.unseen(),
    countryGuess: k.unseen(),
    coordinateGuess: k.unseen(),
    battleRoyaleGameState: k.unseen(),
    battleRoyalePlayer: k.unseen(),
    duel: k.unseen(),
    bullseye: k.unseen(),
  }),
);
export type GameFrame = ShapeOutput<typeof gameFrameShape>;
