export type CloseInfo = { code: number; reason: string };

/** The web client's code for "I'm leaving on purpose". */
export const CLOSE_INTENTIONAL = 4000;
/** Another connection of the same session took this one over. */
export const CLOSE_SUPERSEDED = 4100;
/** The server is restarting; the next connect carries `reconnect=true`. */
export const CLOSE_SERVICE_RESTART = 1012;

/**
 * Closes no reconnect can fix: the session was taken over, or rejected —
 * a refused handshake reports its HTTP status as the code.
 */
export const isFinalClose = ({ code, reason }: CloseInfo) =>
  code === CLOSE_SUPERSEDED ||
  code === 401 ||
  code === 403 ||
  (code === 1001 && /unauthori[sz]ed/i.test(reason));
