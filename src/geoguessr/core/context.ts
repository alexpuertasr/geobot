import type { BaseUrls, SdkLogger } from "../options";

import type { HttpClient } from "./http/http-client";
import type { WebClientIdentity } from "./identity";
import type { Lifetime } from "./lifetime";
import type { NotificationSocket } from "./notification-socket";

/** What every handle shares with the client that created it. */
export type ClientContext = {
  identity: WebClientIdentity;
  http: HttpClient;
  notifications: NotificationSocket;
  lifetime: Lifetime;
  logger: SdkLogger;
  baseUrls: BaseUrls;
};
