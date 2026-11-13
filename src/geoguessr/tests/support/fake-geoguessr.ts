import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { type WebSocket, WebSocketServer } from "ws";

import type { BaseUrls } from "../../options";

import { FakeGame } from "./fake-game";
import { RecordedGamePlayer, recordedGame } from "./recorded-game";

type SocketName = "notification" | "game";

type Route =
  | "partyPage"
  | "activeParty"
  | "party"
  | "createParty"
  | "disbandParty"
  | "startGame"
  | "joinGame"
  | "gameState"
  | "advanceRound";

const ROUTES: [Route, string, RegExp][] = [
  ["partyPage", "GET", /^\/party$/],
  ["activeParty", "GET", /^\/api\/v4\/parties\/v2\/active$/],
  ["party", "GET", /^\/api\/v4\/parties\/v2\/[\w-]+$/],
  ["createParty", "POST", /^\/api\/v4\/parties\/v2$/],
  ["disbandParty", "DELETE", /^\/api\/v4\/parties\/v2\/disband$/],
  ["startGame", "POST", /^\/api\/parties\/v2\/[\w-]+\/lobby$/],
  ["joinGame", "POST", /^\/api\/lobby\/[\w-]+\/join$/],
  ["gameState", "GET", /^\/api\/live-challenge\/[\w-]+$/],
  ["advanceRound", "POST", /^\/api\/live-challenge\/[\w-]+\/advance-round$/],
];

export type RecordedRequest = {
  /** Orders requests and socket messages against each other. */
  seq: number;
  route: Route | null;
  method: string;
  path: string;
  body: unknown;
  headers: IncomingMessage["headers"];
};

type Mishap =
  | { kind: "fail"; status: number }
  | { kind: "lose-response" }
  | { kind: "never-answer" };

type GameLike = Pick<FakeGame, "start" | "stop"> & { state(): unknown };

/**
 * Bound explicitly: on macOS a port picked for "any interface" can still be
 * held on 127.0.0.1 by another process, which the SDK would then reach.
 */
const LOCALHOST = "127.0.0.1";
const HOST_ID = recordedGame.partyPage.initialParty.owner.userId;
const PARTY_ID = recordedGame.partyPage.initialParty.partyId;
const SYNTHETIC_GAME_ID = "00000000-0000-4000-8000-000000000001";

/**
 * GeoGuessr in a box: the party page and API, Game Server 1 and both sockets,
 * serving payloads recorded from production. It runs a fast synthetic game,
 * or replays a recorded one; tests make things go wrong through its verbs.
 */
export class FakeGeoGuessr implements AsyncDisposable {
  readonly requests: RecordedRequest[] = [];
  /** Every message the SDK sent over a socket. */
  readonly received: {
    seq: number;
    socket: SocketName;
    message: { code: string };
  }[] = [];
  readonly connections: { socket: SocketName; params: URLSearchParams }[] = [];
  readonly closes: { socket: SocketName; code: number }[] = [];
  /** Game frames sent while no game socket was there to get them. */
  readonly undelivered: string[] = [];

  party = structuredClone(recordedGame.partyPage.initialParty) as Record<
    string,
    unknown
  >;
  members = structuredClone(recordedGame.partyPage.initialMemberInfo.members);
  partyPageProps: Record<string, unknown> | null = null;
  createPartyResponse: unknown = null;

  readonly #mode: { rounds: number } | "recorded";
  readonly #http = createServer((req, res) => void this.#handle(req, res));
  readonly #notificationServer: WebSocketServer;
  readonly #gameServer: WebSocketServer;
  readonly #partySubscribers = new Set<WebSocket>();
  readonly #gameSubscribers = new Set<WebSocket>();
  readonly #mishaps = new Map<Route, Mishap>();
  readonly #onRequest = new Map<Route, () => void>();
  readonly #refuseUntil: Record<SocketName, number> = {
    notification: 0,
    game: 0,
  };
  #game: GameLike | null = null;
  #seq = 0;
  readonly #sentGameFrames = new Map<string, object>();
  #lostFrame: string | null = null;
  readonly #dropOnConnect: Record<SocketName, boolean> = {
    notification: false,
    game: false,
  };
  #hostAlone = false;
  #startWithoutGameId = false;
  #brokenPage = false;
  #signedOut = false;

  static async start(mode: { rounds: number } | "recorded" = { rounds: 2 }) {
    const fake = new FakeGeoGuessr(mode);
    await new Promise<void>((resolve) =>
      fake.#http.listen(0, LOCALHOST, resolve),
    );
    return fake;
  }

  private constructor(mode: { rounds: number } | "recorded") {
    this.#mode = mode;
    this.#notificationServer = this.#socketServer("notification");
    this.#gameServer = this.#socketServer("game");
  }

  get baseUrls(): BaseUrls {
    return {
      www: `http://127.0.0.1:${port(this.#http)}`,
      gameServer: `http://127.0.0.1:${port(this.#http)}`,
      notificationSocket: `ws://127.0.0.1:${port(this.#notificationServer)}`,
      gameSocket: `ws://127.0.0.1:${port(this.#gameServer)}`,
    };
  }

  get gameId() {
    return this.#mode === "recorded" ? recordedGame.gameId : SYNTHETIC_GAME_ID;
  }

  get hostId() {
    return HOST_ID;
  }

  requestsTo(route: Route) {
    return this.requests.filter((request) => request.route === route);
  }

  openSockets(socket: SocketName) {
    return (socket === "game" ? this.#gameServer : this.#notificationServer)
      .clients.size;
  }

  // ── Things that go wrong ─────────────────────────────────────────────────

  /** The next request to `route` gets `status`, and does nothing. */
  failNext(route: Route, status: number) {
    this.#mishaps.set(route, { kind: "fail", status });
  }

  /** The next request to `route` takes effect, but its answer never arrives. */
  loseNextResponse(route: Route) {
    this.#mishaps.set(route, { kind: "lose-response" });
  }

  /** The next request to `route` is never answered at all. */
  neverAnswerNext(route: Route) {
    this.#mishaps.set(route, { kind: "never-answer" });
  }

  /** Runs `action` when the next request to `route` arrives, before answering it. */
  duringNext(route: Route, action: () => void) {
    this.#onRequest.set(route, action);
  }

  leaveHostAlone() {
    this.#hostAlone = true;
  }

  answerStartWithoutGameId() {
    this.#startWithoutGameId = true;
  }

  serveBrokenPartyPage() {
    this.#brokenPage = true;
  }

  signOut() {
    this.#signedOut = true;
  }

  removeParty() {
    this.partyPageProps = {};
  }

  /** Kills the socket(s) and refuses to let them back in for `ms`. */
  dropSocket(socket: SocketName, { refuseFor = 0 } = {}) {
    this.#refuseUntil[socket] = Date.now() + refuseFor;
    const server =
      socket === "game" ? this.#gameServer : this.#notificationServer;
    for (const client of server.clients) client.terminate();
  }

  /** A server restart: closes the notification sockets with 1012. */
  restartNotificationServer() {
    for (const client of this.#notificationServer.clients) {
      client.close(1012, "Service restart");
    }
  }

  /** The next game frame with `code` is lost, though the socket stays up. */
  loseNextGameFrame(code: string) {
    this.#lostFrame = code;
  }

  /** Closes the game socket(s) the way GeoGuessr does when another session takes over. */
  handGameSocketToAnotherSession() {
    for (const client of this.#gameServer.clients) {
      client.close(4100, "Superseded");
    }
  }

  /** From now on, accepts every `socket` connection and drops it straight away. */
  dropEveryConnection(socket: SocketName) {
    this.#dropOnConnect[socket] = true;
    this.dropSocket(socket);
  }

  // ── Things players and other sessions do ─────────────────────────────────

  /** "Abort game" from a browser signed in as the bot. */
  abortFromBrowser() {
    this.#detachParty("NoGame", null);
    this.#game?.stop();
    // In the logs the party always heard first, GameAborted ~3ms later.
    setTimeout(() => this.sendGameFrame({ code: "GameAborted" }), 3);
  }

  /** The party reports the abort; the game socket never does. */
  detachPartyFromGame() {
    this.#detachParty("NoGame", null);
  }

  startAnotherGameFromBrowser() {
    this.#detachParty("Ongoing", "another-game-id");
  }

  disbandFromBrowser() {
    this.sendPartyFrame("PartyDisbanded", this.party);
  }

  /** "Start next round" from a browser signed in as the bot. */
  advanceFromBrowser() {
    if (this.#game instanceof FakeGame) {
      this.#game.advanceTo(this.#game.currentRound + 1);
    }
  }

  setPlayerPresent(isPresent: boolean) {
    for (const member of this.members) {
      if (member.userId !== HOST_ID) member.isPresent = isPresent;
    }
  }

  sendGameFrame(frame: { code: string; [field: string]: unknown }) {
    if (frame.code === this.#lostFrame) {
      this.#lostFrame = null;
      return;
    }
    if (this.#gameSubscribers.size === 0) this.undelivered.push(frame.code);

    const envelope = {
      gameId: this.gameId,
      timestamp: new Date().toISOString(),
      duel: null,
      bullseye: null,
      ...frame,
    };
    this.#sentGameFrames.set(frame.code, envelope);
    for (const socket of this.#gameSubscribers) {
      socket.send(JSON.stringify(envelope));
    }
  }

  /** Sends the last frame with `code` again, as a leaked socket replays them. */
  resendGameFrame(code: string) {
    const frame = this.#sentGameFrames.get(code);
    if (!frame) throw new Error(`The fake never sent a ${code} frame`);
    for (const socket of this.#gameSubscribers) {
      socket.send(JSON.stringify(frame));
    }
  }

  sendPartyFrame(code: string, payload: unknown) {
    const frame = {
      code,
      topic: `partyv2:${PARTY_ID}`,
      payload: JSON.stringify(payload),
      accessToken: null,
      client: "Unknown",
      timestamp: new Date().toISOString(),
    };
    for (const socket of this.#partySubscribers) {
      socket.send(JSON.stringify(frame));
    }
  }

  async [Symbol.asyncDispose]() {
    this.#game?.stop();
    for (const server of [this.#gameServer, this.#notificationServer]) {
      for (const client of server.clients) client.terminate();
      await new Promise((resolve) => server.close(resolve));
    }
    this.#http.closeAllConnections();
    await new Promise((resolve) => this.#http.close(resolve));
  }

  // ── HTTP ─────────────────────────────────────────────────────────────────

  async #handle(req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? "/", "http://fake").pathname;
    const route =
      ROUTES.find(
        ([, method, pattern]) => method === req.method && pattern.test(path),
      )?.[0] ?? null;
    const body = await readBody(req);
    this.requests.push({
      seq: ++this.#seq,
      route,
      method: req.method ?? "",
      path,
      body,
      headers: req.headers,
    });

    const action = route ? this.#onRequest.get(route) : undefined;
    if (route && action) {
      this.#onRequest.delete(route);
      action();
    }

    const mishap = route ? this.#mishaps.get(route) : undefined;
    if (route && mishap) this.#mishaps.delete(route);
    if (mishap?.kind === "never-answer") return;
    if (mishap?.kind === "fail") return send(res, mishap.status, "Bad Gateway");

    const answer = route
      ? this.#answer(route, body)
      : { status: 404, body: "" };
    if (mishap?.kind === "lose-response") return req.socket.destroy();
    send(res, answer.status, answer.body);
  }

  #answer(route: Route, body: unknown): { status: number; body: unknown } {
    switch (route) {
      case "partyPage":
        return { status: 200, body: this.#partyPage() };
      case "activeParty":
      case "party":
        return { status: 200, body: this.party };
      case "createParty":
        return { status: 200, body: this.createPartyResponse ?? this.party };
      case "disbandParty":
        this.sendPartyFrame("PartyDisbanded", this.party);
        return { status: 200, body: "" };
      case "startGame":
        return this.#startGame();
      case "joinGame":
        return { status: 200, body: { gameLobbyId: this.gameId } };
      case "gameState":
        return { status: 200, body: this.#game?.state() ?? null };
      case "advanceRound":
        return this.#advance((body as { toRoundNumber: number }).toRoundNumber);
    }
  }

  #partyPage() {
    if (this.#brokenPage) return "<html>Down for maintenance</html>";

    const pageProps = this.#signedOut
      ? { statusCode: 401 }
      : (this.partyPageProps ?? {
          initialParty: this.party,
          initialMemberInfo: {
            members: this.members,
            totalCount: this.members.length,
          },
        });
    const nextData = { buildId: "fake-build", props: { pageProps } };
    return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></html>`;
  }

  #startGame() {
    // GeoGuessr only counts players present in the party: the bot too.
    if (this.#hostAlone || this.#partySubscribers.size === 0) {
      return {
        status: 400,
        body: "Not enough players to start the game. Expected 2, got 1",
      };
    }

    this.sendPartyFrame("PartyGameStarted", {
      partyId: PARTY_ID,
      gameId: this.gameId,
      lobbyId: this.gameId,
      gameType: "LiveChallenge",
      nodeId: "",
      players: [HOST_ID],
    });
    this.party = { ...this.party, gameState: "Ongoing", lobbyId: this.gameId };
    this.sendPartyFrame("PartyUpdated", this.party);

    this.#game = this.#createGame();
    this.#game.start();

    const response =
      this.#mode === "recorded"
        ? recordedGame.startResponse
        : { gameLobbyId: this.gameId, partyId: PARTY_ID };
    return {
      status: 200,
      body: this.#startWithoutGameId ? { status: "Closed" } : response,
    };
  }

  #createGame(): GameLike {
    if (this.#mode === "recorded") {
      return new RecordedGamePlayer((socket, frame) =>
        socket === "game"
          ? this.sendGameFrame(frame as { code: string })
          : this.#sendRecordedPartyFrame(frame),
      );
    }

    return new FakeGame(this.gameId, this.#mode.rounds, {
      send: (code, liveChallenge) =>
        this.sendGameFrame({ code, liveChallenge }),
      finished: () => {
        this.party = { ...this.party, gameState: "Finished", lobbyId: null };
        this.sendPartyFrame("PartyUpdated", this.party);
      },
    });
  }

  #advance(toRoundNumber: number) {
    const game = this.#game;
    if (game instanceof RecordedGamePlayer) {
      const response = game.advanceTo(toRoundNumber);
      return response ? { status: 200, body: response } : invalidRound();
    }
    if (game instanceof FakeGame && game.advanceTo(toRoundNumber)) {
      return { status: 200, body: game.state() };
    }
    return invalidRound();
  }

  #sendRecordedPartyFrame(frame: object) {
    for (const socket of this.#partySubscribers)
      socket.send(JSON.stringify(frame));
  }

  #detachParty(gameState: string, lobbyId: string | null) {
    this.party = { ...this.party, gameState, lobbyId };
    this.sendPartyFrame("PartyUpdated", this.party);
  }

  // ── Sockets ──────────────────────────────────────────────────────────────

  #socketServer(name: SocketName) {
    const server = new WebSocketServer({
      host: LOCALHOST,
      port: 0,
      verifyClient: (_, accept) =>
        Date.now() < this.#refuseUntil[name]
          ? accept(false, 503)
          : accept(true),
    });

    server.on("connection", (socket, req) => {
      const params = new URL(req.url ?? "/", "ws://fake").searchParams;
      this.connections.push({ socket: name, params });
      socket.on("close", (code) => {
        this.closes.push({ socket: name, code });
        this.#partySubscribers.delete(socket);
        this.#gameSubscribers.delete(socket);
      });

      if (this.#dropOnConnect[name]) {
        setTimeout(() => socket.close(1011, "Dropped"), 20);
        return;
      }
      socket.on("message", (raw) =>
        this.#onSocketMessage(name, socket, JSON.parse(String(raw))),
      );
    });
    return server;
  }

  #onSocketMessage(
    name: SocketName,
    socket: WebSocket,
    message: { code: string; topic?: string; playerId?: string },
  ) {
    this.received.push({ seq: ++this.#seq, socket: name, message });

    if (
      message.code === "Subscribe" &&
      message.topic === `partyv2:${PARTY_ID}`
    ) {
      this.#partySubscribers.add(socket);
      this.sendPartyFrame("PartyMemberListUpdated", {
        partyId: PARTY_ID,
        members: this.members,
        totalCount: this.members.length,
      });
    }
    if (message.code === "Unsubscribe") this.#partySubscribers.delete(socket);
    if (message.code === "SubscribeToLobby") {
      this.#gameSubscribers.add(socket);
      this.sendGameFrame({
        code: "ConnectionOpened",
        playerId: message.playerId,
      });
    }
  }
}

const port = (server: { address(): AddressInfo | string | null }) =>
  (server.address() as AddressInfo).port;

const readBody = async (req: IncomingMessage): Promise<unknown> => {
  let text = "";
  for await (const chunk of req) text += chunk;
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const send = (res: ServerResponse, status: number, body: unknown) => {
  const isText = typeof body === "string";
  res.writeHead(status, {
    "content-type": isText ? "text/html" : "application/json",
  });
  res.end(isText ? body : JSON.stringify(body));
};

const invalidRound = () => ({
  status: 400,
  body: { message: "Invalid round" },
});
