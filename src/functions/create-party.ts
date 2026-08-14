import { WebClient } from "@slack/web-api";
import type { Handler } from "aws-lambda";
import { Resource } from "sst";
import type z from "zod";

import { createGeoClient } from "../geoguessr/client";
import { logger } from "../logger";

import type {
  createPartyRequest,
  createPartyResponse,
} from "./schemas/create-party";

const slack = new WebClient(Resource.SlackBotToken.value);

export type CreatePartyEvent = {
  trigger?: "cron" | "slack" | "tests";
  options?: z.input<typeof createPartyRequest>;
};

export type CreatePartyResult = z.output<typeof createPartyResponse> | null;

export const handler: Handler<CreatePartyEvent, CreatePartyResult> = async (
  event,
  context,
) => {
  logger.addContext(context);

  logger.appendPersistentKeys({ trigger: event.trigger ?? "unknown" });

  const geoClient = await createGeoClient({
    cookies: Resource.GeoguessrCookies.value,
  });

  const currentParty = geoClient.currentParty();

  if (currentParty) {
    await geoClient.disbandParty();
  }

  const party = await geoClient.createParty(event.options);

  if (!party) {
    logger.error("❌ Failed to create party", { party });
    return null;
  }

  const partyLink = `https://www.geoguessr.com/join/${party.joinCode.code}?j=3`;

  if (event.trigger === "slack") {
    const result = await slack.chat.postMessage({
      channel: Resource.SlackChannel.value,
      text: `<!here> time to guess!\n:geoguessr: ${partyLink}\n:google_meet: ${Resource.GoogleMeetsLink.value}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<!here> time to guess!\n:geoguessr: ${partyLink}\n:google_meet: ${Resource.GoogleMeetsLink.value}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Start once everyone is ready!",
              },
              style: "primary",
              action_id: "start_game",
            },
          ],
        },
      ],
    });

    if (result.ok) {
      logger.info(`✅ Slack message sent successfully`);
    } else {
      logger.error(`❌ Slack API error:`, { error: result.error });
    }
  }

  return party;
};
