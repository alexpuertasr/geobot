import * as z from "zod";

import { type ShapeKit, type ShapeOutput, shape } from "./shape";

const leaderboardEntry = (k: ShapeKit) =>
  k.object({
    id: k.need(z.string()),
    name: k.need(z.string()),
    position: k.need(z.number()),
    /** Points — or, on the guess-time leaderboard, milliseconds. */
    score: k.need(z.number()),
    isGuest: k.keep(z.boolean()),
    isVerified: k.keep(z.boolean()),
    flair: k.keep(z.number()),
    avatarPath: k.keep(z.string()),
  });

/** No player id: guesses line up, by index, with the round's `entries`. */
const guess = (k: ShapeKit) =>
  k.object({
    roundNumber: k.keep(z.number()),
    lat: k.keep(z.number()),
    lng: k.keep(z.number()),
    /** Metres. */
    distance: k.keep(z.number()),
    score: k.keep(z.number()),
    /** Seconds; can run past the round time. */
    time: k.keep(z.number()),
    /** Always `false` so far. */
    wasCorrect: k.keep(z.boolean()),
  });

const leaderboards = (k: ShapeKit) =>
  k.object({
    game: k.keep(
      k.object({ entries: k.need(z.array(leaderboardEntry(k))) }).nullable(),
    ),
    round: k.keep(
      k
        .object({
          roundNumber: k.need(z.number()),
          entries: k.need(z.array(leaderboardEntry(k))),
          guesses: k.keep(z.array(guess(k))),
          totalGuessesOnRound: k.keep(z.number()),
        })
        .nullable(),
    ),
    roundGuessTime: k.keep(
      k
        .object({
          roundNumber: k.need(z.number()),
          entries: k.need(z.array(leaderboardEntry(k))),
        })
        .nullable(),
    ),
  });

const coordinate = (k: ShapeKit) =>
  k.object({ lat: k.keep(z.number()), lng: k.keep(z.number()) });

const mapBounds = (k: ShapeKit) =>
  k.object({ min: k.keep(coordinate(k)), max: k.keep(coordinate(k)) });

const movementOptions = (k: ShapeKit) =>
  k.object({
    forbidMoving: k.keep(z.boolean()),
    forbidZooming: k.keep(z.boolean()),
    forbidRotating: k.keep(z.boolean()),
  });

/** What players are shown; only panoramas so far, the other payloads `null`. */
const question = (k: ShapeKit) =>
  k.object({
    type: k.keep(k.oneOf(["Panorama"])),
    panoramaQuestionPayload: k.keep(
      k
        .object({
          panorama: k.keep(
            k.object({
              panoId: k.keep(z.string()),
              lat: k.keep(z.number()),
              lng: k.keep(z.number()),
              countryCode: k.keep(z.string()),
              heading: k.keep(z.number()),
              pitch: k.keep(z.number()),
              zoom: k.keep(z.number()),
            }),
          ),
          movementOptions: k.keep(movementOptions(k)),
          mapBounds: k.keep(mapBounds(k)),
          mapName: k.keep(z.string()),
          mapSlug: k.keep(z.string()),
          guessMapType: k.keep(z.string()),
          context: k.keep(z.string()),
        })
        .nullable(),
    ),
    quizQuestionPayload: k.unseen(),
    staticContentPayload: k.unseen(),
    customPanoramaQuestionPayload: k.unseen(),
    fullScreenImageQuestionPayload: k.unseen(),
  });

/** The right answer; only coordinates so far, the other payloads `null`. */
const answer = (k: ShapeKit) =>
  k.object({
    type: k.keep(k.oneOf(["Coordinate"])),
    coordinateAnswerPayload: k.keep(
      k.object({ coordinate: k.keep(coordinate(k)) }).nullable(),
    ),
    countryAnswerPayload: k.unseen(),
    singleChoicePayload: k.unseen(),
    singleChoiceCoordinatePayload: k.unseen(),
    orderingAnswerPayload: k.unseen(),
    rangeAnswerPayload: k.unseen(),
    multipleAnswerAnswerPayload: k.unseen(),
  });

const round = (k: ShapeKit) =>
  k.object({
    roundNumber: k.need(z.number()),
    state: k.need(k.oneOf(["Starting", "Ongoing", "Ended"])),
    startTime: k.keep(z.string()),
    endTime: k.keep(z.string()),
    roundTime: k.keep(z.number()),
    maxRoundScore: k.keep(z.number()),
    id: k.keep(z.string()),
    question: k.keep(question(k)),
    answer: k.keep(answer(k)),
    hints: k.unseen(),
    panorama: k.unseen(),
    quizBankEntryId: k.unseen(),
  });

const state = (k: ShapeKit) =>
  k.object({
    gameId: k.need(z.string()),
    status: k.need(k.oneOf(["Ongoing", "Finished"])),
    /** Only grows: an older state is stale. */
    version: k.need(z.number()),
    currentRoundNumber: k.need(z.number()),
    roundCount: k.need(z.number()),
    rounds: k.need(z.array(round(k))),
    currentStepNumber: k.keep(z.number()),
    totalSteps: k.keep(z.number()),
    hostId: k.keep(z.string()),
    /** Everyone in the game, the bot and players who never guess included. */
    playerIds: k.keep(z.array(z.string())),
    playerCount: k.keep(z.number()),
    mapName: k.keep(z.string()),
    mapBounds: k.keep(mapBounds(k)),
    options: k.keep(
      k.object({
        roundCount: k.keep(z.number()),
        roundTime: k.keep(z.number()),
        mapSlug: k.keep(z.string()),
        guessMapType: k.keep(z.string()),
        movementOptions: k.keep(movementOptions(k)),
        isSinglePlayer: k.keep(z.boolean()),
        /** Always `Unknown` so far. */
        scoringType: k.keep(z.string()),
        context: k.keep(z.string()),
      }),
    ),
    // Filled for players, never for the host.
    guesses: k.unseen(),
    claimedHints: k.unseen(),
    totalScore: k.unseen(),
    leaderboards: k.unseen(),
    playerPositions: k.unseen(),
    aggregatedAnswerStats: k.unseen(),
  });

export const leaderboardsShape = shape(
  "LiveChallengeLeaderboards",
  leaderboards,
);
export type Leaderboards = ShapeOutput<typeof leaderboardsShape>;
export type LeaderboardEntry = NonNullable<
  Leaderboards["game"]
>["entries"][number];

/**
 * Carried by game frames, and returned by the game-state and advance-round
 * endpoints.
 */
export const liveChallengeStateShape = shape("LiveChallengeState", state);
export type LiveChallengeState = ShapeOutput<typeof liveChallengeStateShape>;
export type RoundData = LiveChallengeState["rounds"][number];
