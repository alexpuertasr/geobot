import type { ClientContext } from "../../core/context";
import { deferred } from "../../core/deferred";
import type { HttpResponse } from "../../core/http/http-client";
import { isTransient } from "../../core/http/retry";
import {
  APIError,
  GeoGuessrError,
  NotEnoughPlayersError,
  serverMessage,
} from "../../errors";
import { routes } from "../../protocol/routes";
import { startGameResponseSchema } from "../../protocol/schemas/party";

import type { Party } from "./party";

/** How long to wait for `PartyGameStarted` when the response can't say. */
const ANNOUNCEMENT_TIMEOUT_MS = 10_000;

/**
 * Asks GeoGuessr to start the party's game and resolves its id: from the
 * response, or from the `PartyGameStarted` frame the web client goes by. A
 * request that failed on the way may still have started the game, so the
 * frame decides then.
 */
export const requestGameStart = async (
  party: Party,
  context: ClientContext,
): Promise<string> => {
  // The frame usually beats the response: listen before sending.
  const announcement = listenForGameStart(party);
  try {
    return await sendStart(party, context, announcement);
  } finally {
    announcement.stop();
  }
};

type Announcement = ReturnType<typeof listenForGameStart>;

const sendStart = async (
  party: Party,
  context: ClientContext,
  announcement: Announcement,
): Promise<string> => {
  let response: HttpResponse;
  try {
    response = await context.http.request(routes.startGame(party.id));
  } catch (error) {
    return recoverFromFailedStart(error, context, announcement);
  }

  const started = startGameResponseSchema.safeParse(response.body);
  return started.success ? started.data.gameLobbyId : announcement.wait();
};

const recoverFromFailedStart = (
  error: unknown,
  context: ClientContext,
  announcement: Announcement,
): Promise<string> => {
  if (isNotEnoughPlayers(error)) throw toNotEnoughPlayers(error);
  if (!isTransient(error)) throw error;

  context.logger.warn("🎲 Start request failed; waiting for the party", {
    error,
  });
  return announcement.wait().catch(() => Promise.reject(error));
};

/** Captures the next `PartyGameStarted`; `wait()` bounds the wait for it. */
const listenForGameStart = (party: Party) => {
  const gameId = deferred<string>();
  const unsubscribe = party.once("gameStarted", (started) =>
    gameId.resolve(started.gameId),
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return {
    wait: () => {
      timeout = setTimeout(
        () =>
          gameId.reject(
            new GeoGuessrError("GeoGuessr never said which game started"),
          ),
        ANNOUNCEMENT_TIMEOUT_MS,
      );
      return gameId.promise;
    },
    stop: () => {
      unsubscribe();
      clearTimeout(timeout);
    },
  };
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
