import { describe, expect, test } from "vitest";

import { ReconnectState } from "../core/socket/reconnect-state";

const AN_UNEXPECTED_CLOSE = { code: 1006, reason: "" };

describe("counting reconnect attempts", () => {
  test("starts over once a connection has proved healthy", () => {
    const state = new ReconnectState();
    state.beginAttempt();
    state.recordDrop(AN_UNEXPECTED_CLOSE);
    state.beginAttempt();
    state.markOpened();

    state.markHealthy();

    expect(state.recordDrop(AN_UNEXPECTED_CLOSE).attempt).toBe(1);
  });
});
