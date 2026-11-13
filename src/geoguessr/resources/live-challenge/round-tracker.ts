import type {
  LiveChallengeState,
  RoundData,
} from "../../protocol/schemas/live-challenge";

import type { LiveChallengeEvents } from "./events";
import { toDate } from "./rounds";

type RoundEventName = "roundStarting" | "roundStarted" | "roundEnded";

export type RoundAnnouncement = {
  [Event in RoundEventName]: {
    event: Event;
    payload: LiveChallengeEvents[Event];
  };
}[RoundEventName];

/**
 * Turns game states into round events, each announced once however many
 * states repeat it — and including those a resync reveals were missed while
 * the socket was down. That's why events come from states, not frame codes.
 */
export class RoundTracker {
  readonly #announced = new Set<string>();

  announcementsFor(state: LiveChallengeState): RoundAnnouncement[] {
    return [...state.rounds]
      .sort((a, b) => a.roundNumber - b.roundNumber)
      .flatMap((round) => this.#newAnnouncement(round, state) ?? []);
  }

  #newAnnouncement(round: RoundData, state: LiveChallengeState) {
    const key = `${round.roundNumber}:${round.state}`;
    if (this.#announced.has(key)) return null;

    const announcement = announcementFor(round, state);
    if (announcement) this.#announced.add(key);
    return announcement;
  }
}

const announcementFor = (
  round: RoundData,
  state: LiveChallengeState,
): RoundAnnouncement | null => {
  const base = {
    round: round.roundNumber,
    roundCount: state.roundCount,
    state,
  };

  switch (round.state) {
    case "Starting":
      return {
        event: "roundStarting",
        payload: { ...base, startsAt: toDate(round.startTime) },
      };
    case "Ongoing":
      return {
        event: "roundStarted",
        payload: { ...base, endsAt: toDate(round.endTime) },
      };
    case "Ended":
      return {
        event: "roundEnded",
        payload: {
          ...base,
          isLastRound: round.roundNumber >= state.roundCount,
        },
      };
    default:
      return null;
  }
};
