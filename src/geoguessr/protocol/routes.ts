/** Where the web client runs; GeoGuessr checks requests and sockets come from it. */
export const GEOGUESSR_ORIGIN = "https://www.geoguessr.com";

export type Host = "www" | "gameServer";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Route = { method: Method; host: Host; path: string };

const route = (method: Method, host: Host, path: string): Route => ({
  method,
  host,
  path,
});

/** Every GeoGuessr endpoint the SDK calls, as GeoGuessr's own web client calls it. */
export const routes = {
  /** Server-rendered: the current party, its members and the client build id. */
  partyPage: () => route("GET", "www", "/party"),
  /** 204 when the account has no party. */
  activeParty: () => route("GET", "www", "/api/v4/parties/v2/active"),
  party: (partyId: string) =>
    route("GET", "www", `/api/v4/parties/v2/${partyId}`),
  createParty: () => route("POST", "www", "/api/v4/parties/v2"),
  disbandParty: () => route("DELETE", "www", "/api/v4/parties/v2/disband"),

  /**
   * The web client's `legacyStartInGs1`: Live Challenge runs on Game Server 1.
   * (`/api/v4/parties/v2/start-game` is for Game Server 2 modes only.)
   */
  startGame: (partyId: string) =>
    route("POST", "gameServer", `/api/parties/v2/${partyId}/lobby`),

  joinGame: (gameId: string) =>
    route("POST", "gameServer", `/api/lobby/${gameId}/join`),
  gameState: (gameId: string) =>
    route("GET", "gameServer", `/api/live-challenge/${gameId}`),
  advanceRound: (gameId: string) =>
    route("POST", "gameServer", `/api/live-challenge/${gameId}/advance-round`),
};
