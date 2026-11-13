import type { GameFrame } from "../../protocol/schemas/frames";
import type {
  LeaderboardEntry,
  Leaderboards,
  LiveChallengeState,
} from "../../protocol/schemas/live-challenge";

export type RoundEvent = {
  /** 1-based. */
  round: number;
  roundCount: number;
  state: LiveChallengeState;
};

export type LiveChallengeEvents = {
  /**
   * A round's 5s countdown began. GeoGuessr only announces it for rounds the
   * host advances to; round 1's only shows if a resync lands during it.
   */
  roundStarting: RoundEvent & { startsAt: Date | null };
  roundStarted: RoundEvent & { endsAt: Date | null };
  roundEnded: RoundEvent & { isLastRound: boolean };
  /** New guesses were scored; `standings` is the game leaderboard. */
  leaderboardUpdated: {
    standings: LeaderboardEntry[];
    leaderboards: Leaderboards;
  };
  /** The last round ended; final standings may still change, `done()` waits. */
  finished: { roundCount: number; state: LiveChallengeState };
  aborted: { reason: AbortReason };
  /** Every frame of the game, raw: an escape hatch for codes not handled. */
  frame: GameFrame;
};

/**
 * - `gameAborted`: the host's "Abort game" (by the bot, or by anyone signed
 *   in as it), or the party moving on to another game.
 * - `partyDisbanded`: the party was disbanded, which sends every player home.
 */
export type AbortReason = "gameAborted" | "partyDisbanded";

export type GameResult =
  | {
      outcome: "finished";
      /** The final game leaderboard, best first. */
      standings: LeaderboardEntry[];
      state: LiveChallengeState;
    }
  | {
      outcome: "aborted";
      reason: AbortReason;
      /** The leaderboard as it stood when the game was aborted. */
      standings: LeaderboardEntry[];
      state: LiveChallengeState | null;
    };
