import { Resource } from "sst";
import * as z from "zod";

import { initialProps } from "./functions/schemas/initial-props";
import { logger } from "./logger";

export async function getPartyPageProps() {
  const response = await fetch("https://www.geoguessr.com/party", {
    headers: {
      cookie: Resource.GeoguessrCookies.value,
    },
  });

  const html = await response.text();

  if (!response.ok || new URL(response.url).pathname !== "/party") {
    logger.error("📄 Party page fetch rejected", {
      status: response.status,
      finalUrl: response.url,
      body: html,
    });

    throw new Error(`Party page fetch rejected with status ${response.status}`);
  }

  const nextData = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.*?)<\/script>/s,
  )?.[1];

  if (!nextData) {
    logger.error("📄 __NEXT_DATA__ not found in party page HTML", {
      status: response.status,
      finalUrl: response.url,
      body: html,
    });

    throw new Error("__NEXT_DATA__ not found in party page HTML");
  }

  try {
    return initialProps.parse(JSON.parse(nextData)).props.pageProps;
  } catch (error) {
    logger.error("📄 Failed to parse party page __NEXT_DATA__", {
      reason:
        error instanceof z.ZodError ? z.prettifyError(error) : String(error),
      payload: nextData,
    });

    throw error;
  }
}
