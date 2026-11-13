import type { Logger } from "@aws-lambda-powertools/logger";
import { Resource } from "sst";

import { logger as appLogger } from "@/logger";

import { GEOGUESSR_ORIGIN } from "./protocol/routes";

export type SdkLogger = Pick<Logger, "debug" | "info" | "warn" | "error">;

export type BaseUrls = {
  www: string;
  /** Game Server 1, which runs Live Challenges. */
  gameServer: string;
  notificationSocket: string;
  gameSocket: string;
};

export const defaultBaseUrls: BaseUrls = {
  www: GEOGUESSR_ORIGIN,
  gameServer: "https://game-server.geoguessr.com",
  notificationSocket: "wss://api.geoguessr.com/ws",
  gameSocket: "wss://game-server.geoguessr.com/ws",
};

export type GeoGuessrOptions = {
  /**
   * The host account's session cookies. Defaults to the `GeoguessrCookies`
   * SST secret, which must then be linked to the function.
   */
  cookies?: string;
  /**
   * Milliseconds each request attempt may take. Defaults to 10s; a GET that
   * times out, fails on the network or gets a 502/503/504 is tried twice
   * more.
   */
  timeout?: number;
  /** Defaults to the app's Powertools logger. */
  logger?: SdkLogger;
  /** Points the SDK somewhere else, e.g. at a mock server in tests. */
  baseUrls?: Partial<BaseUrls>;
};

export type ResolvedOptions = Required<Omit<GeoGuessrOptions, "baseUrls">> & {
  baseUrls: BaseUrls;
};

export const resolveOptions = (
  options: GeoGuessrOptions = {},
): ResolvedOptions => ({
  cookies: options.cookies ?? defaultCookies(),
  timeout: options.timeout ?? 10_000,
  logger: options.logger ?? appLogger,
  baseUrls: { ...defaultBaseUrls, ...options.baseUrls },
});

/** Only read when needed: SST throws if the secret isn't linked. */
const defaultCookies = () => Resource.GeoguessrCookies.value;
