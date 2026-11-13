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
  /** Milliseconds a request may take, retries included. Defaults to 20s. */
  timeout?: number;
  /**
   * How often a failed GET is retried (network errors, timeouts,
   * 502/503/504). Defaults to 3, like the web client. Writes never are.
   */
  maxRetries?: number;
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
  timeout: options.timeout ?? 20_000,
  maxRetries: options.maxRetries ?? 3,
  logger: options.logger ?? appLogger,
  baseUrls: { ...defaultBaseUrls, ...options.baseUrls },
});

/** Only read when needed: SST throws if the secret isn't linked. */
const defaultCookies = () => Resource.GeoguessrCookies.value;
