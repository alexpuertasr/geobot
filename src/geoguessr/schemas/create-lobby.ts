import * as z from "zod";

export const createLobbyRequest = z.object({}).prefault({});

export const createLobbyResponse = z.object({ gameLobbyId: z.string() });
