import type {
  LeaderboardEntry,
  LiveChallengeState,
  RoundData,
} from "../../protocol/schemas/live-challenge";

const currentRound = (state: LiveChallengeState): RoundData | undefined =>
  state.rounds.find((round) => round.roundNumber === state.currentRoundNumber);

/**
 * The round to advance to, or `null`. Like the web client, which only offers
 * "Start next round" once the current round has ended — so a second session
 * advancing during our pause can't make us skip a round.
 */
export const nextRoundNumber = (state: LiveChallengeState): number | null => {
  if (currentRound(state)?.state !== "Ended") return null;

  const next = state.currentRoundNumber + 1;
  return next <= state.roundCount ? next : null;
};

/** When the current round should change phase next, if it's counting down or running. */
export const nextPhaseChange = (state: LiveChallengeState): Date | null => {
  const round = currentRound(state);
  if (round?.state === "Starting") return toDate(round.startTime);
  if (round?.state === "Ongoing") return toDate(round.endTime);
  return null;
};

export const byPosition = (entries: LeaderboardEntry[]) =>
  [...entries].sort((a, b) => a.position - b.position);

export const toDate = (value: string | null | undefined) =>
  value ? new Date(value) : null;
