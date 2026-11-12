import * as z from "zod";

export type LiveChallengeState = z.infer<typeof liveChallengeState>;

const coordinate = z.object({ lat: z.number(), lng: z.number() });

const mapBounds = z.object({ min: coordinate, max: coordinate });

const movementOptions = z.object({
  forbidMoving: z.boolean(),
  forbidRotating: z.boolean(),
  forbidZooming: z.boolean(),
});

const panoramaQuestion = z.object({
  panorama: z.object({
    panoId: z.string(),
    lat: z.number(),
    lng: z.number(),
    countryCode: z.string(),
    heading: z.number(),
    pitch: z.number(),
    zoom: z.number(),
  }),
  movementOptions,
  mapBounds,
  mapName: z.string(),
  mapSlug: z.string(),
  context: z.string(),
  guessMapType: z.string(),
});

const round = z.object({
  id: z.string(),
  roundNumber: z.number(),
  state: z.string(),
  roundTime: z.number(),
  maxRoundScore: z.number(),
  startTime: z.string(),
  endTime: z.string(),
  question: z.object({
    type: z.string(),
    panoramaQuestionPayload: panoramaQuestion.nullish(),
  }),
  answer: z.object({
    type: z.string(),
    coordinateAnswerPayload: z.object({ coordinate }).nullish(),
  }),
});

export const liveChallengeState = z.object({
  gameId: z.string(),
  status: z.string(),
  version: z.number(),
  hostId: z.string(),
  playerIds: z.array(z.string()),
  playerCount: z.number(),
  currentRoundNumber: z.number(),
  roundCount: z.number(),
  currentStepNumber: z.number(),
  totalSteps: z.number(),
  rounds: z.array(round),
  options: z.object({
    roundCount: z.number(),
    roundTime: z.number(),
    mapSlug: z.string(),
    guessMapType: z.string(),
    movementOptions,
    isSinglePlayer: z.boolean(),
    scoringType: z.string(),
    context: z.string(),
  }),
  mapName: z.string(),
  mapBounds,
});
