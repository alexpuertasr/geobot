/** Where the web client runs; GeoGuessr checks requests and sockets come from it. */
export const GEOGUESSR_ORIGIN = "https://www.geoguessr.com";

export type Host = "www" | "gameServer";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Route = {
  /** Its key in `routes`, which names it in logs and recordings. */
  name: keyof typeof routes;
  method: Method;
  host: Host;
  path: string;
};

const route = (
  name: Route["name"],
  method: Method,
  host: Host,
  path: string,
): Route => ({ name, method, host, path });

/** Every GeoGuessr endpoint the SDK calls, as GeoGuessr's own web client calls it. */
export const routes = {
  /** Server-rendered: the current party, its members and the client build id. */
  partyPage: () => route("partyPage", "GET", "www", "/party"),
  /** 204 when the account has no party. */
  activeParty: () =>
    route("activeParty", "GET", "www", "/api/v4/parties/v2/active"),
  party: (partyId: string) =>
    route("party", "GET", "www", `/api/v4/parties/v2/${partyId}`),
  createParty: () => route("createParty", "POST", "www", "/api/v4/parties/v2"),
  disbandParty: () =>
    route("disbandParty", "DELETE", "www", "/api/v4/parties/v2/disband"),

  /**
   * The web client's `legacyStartInGs1`: Live Challenge runs on Game Server 1.
   * (`/api/v4/parties/v2/start-game` is for Game Server 2 modes only.)
   */
  startGame: (partyId: string) =>
    route(
      "startGame",
      "POST",
      "gameServer",
      `/api/parties/v2/${partyId}/lobby`,
    ),

  joinGame: (gameId: string) =>
    route("joinGame", "POST", "gameServer", `/api/lobby/${gameId}/join`),
  gameState: (gameId: string) =>
    route("gameState", "GET", "gameServer", `/api/live-challenge/${gameId}`),
  advanceRound: (gameId: string) =>
    route(
      "advanceRound",
      "POST",
      "gameServer",
      `/api/live-challenge/${gameId}/advance-round`,
    ),
};
