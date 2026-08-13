import z from "zod";

export const createPartyRequest = z.object({
  gameType: z.literal("LiveChallenge").default("LiveChallenge"),
  gameSettings: z.object({
    forbidMoving: z.boolean().default(false),
    forbidRotating: z.boolean().default(false),
    forbidZooming: z.boolean().default(false),
    guessMapType: z.literal("roadmap").default("roadmap"),
    mapSlug: z.literal("world").default("world"),
    masterControl: z.boolean().default(false),
    masterControlAutoStartRounds: z.boolean().default(false),
    roundCount: z.int().min(1).default(5),
    roundTime: z.int().min(10).default(90),
  }),
  wasCustomized: z.boolean().default(false),
});

export const createPartyResponse = z.object({
  gameType: z.literal("LiveChallenge"),
  gameSettings: z.object({
    forbidMoving: z.boolean(),
    forbidRotating: z.boolean(),
    forbidZooming: z.boolean(),
    guessMapType: z.literal("roadmap"),
    individualInitialHealth: z.boolean(),
    initialHealthTeamOne: z.int(),
    initialHealthTeamTwo: z.int(),
    mapSlug: z.literal("world"),
    roundCount: z.int(),
    roundTime: z.int(),
  }),
  joinCode: z.object({
    code: z.string(),
  }),
});
