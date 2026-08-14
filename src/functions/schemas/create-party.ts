import * as z from "zod";

import { party } from "./party";

export const createPartyRequest = z
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

export const createPartyResponse = z.object(party.shape);
