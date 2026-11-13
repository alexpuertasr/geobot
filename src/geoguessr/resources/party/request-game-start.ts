import type { ClientContext } from "../../core/context";
import { isTransient } from "../../core/http/http-client";
import {
  APIError,
  GeoGuessrError,
  NotEnoughPlayersError,
  serverMessage,
} from "../../errors";
import { routes } from "../../protocol/routes";
import { startGameResponseShape } from "../../protocol/schemas/party";

import type { Party } from "./party";

/**
 * Asks GeoGuessr to start the party's game and returns the game's id. A
 * request whose answer was lost, or doesn't name the game, may still have
 * started it: the party then says which game it's in.
 */
export const requestGameStart = async (
  party: Party,
  context: ClientContext,
): Promise<string> => {
  let body: unknown;
  try {
    ({ body } = await context.http.request(routes.startGame(party.id)));
  } catch (error) {
    if (isNotEnoughPlayers(error)) throw toNotEnoughPlayers(error);
    if (!isTransient(error)) throw error;

    context.logger.warn("🎲 Start request failed; asking the party", { error });
    return gameIdFromParty(party, error);
  }

  const lobby = context.reader.read(startGameResponseShape, body);
  if (lobby) return lobby.gameLobbyId;

  return gameIdFromParty(
    party,
    new GeoGuessrError("GeoGuessr's start response didn't name the game"),
  );
};

const gameIdFromParty = async (party: Party, error: unknown) => {
  const { gameState, lobbyId } = await party.refresh();
  if (gameState === "Ongoing" && lobbyId) return lobbyId;
  throw error;
};

const isNotEnoughPlayers = (error: unknown): error is APIError =>
  error instanceof APIError &&
  error.status === 400 &&
  /enough players/i.test(serverMessage(error.body) ?? "");

const toNotEnoughPlayers = ({ status, method, url, body }: APIError) =>
  new NotEnoughPlayersError({
    status,
    method,
    url,
    body,
    message: serverMessage(body) ?? undefined,
  });
