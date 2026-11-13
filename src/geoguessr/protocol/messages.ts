/** What the bot sends over GeoGuessr's sockets, shaped like the web client's. */
export const messages = {
  heartbeat: () => ({ code: "HeartBeat" }),
  subscribe: (topic: string) => ({ code: "Subscribe", topic, client: "web" }),
  unsubscribe: (topic: string) => ({
    code: "Unsubscribe",
    topic,
    client: "web",
  }),
  subscribeToLobby: (gameId: string, playerId: string) => ({
    code: "SubscribeToLobby",
    gameId,
    playerId,
  }),
};

/** Holding this topic is what makes the bot "present" in the party. */
export const partyTopic = (partyId: string) => `partyv2:${partyId}`;
