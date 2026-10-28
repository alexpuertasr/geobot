import { WebClient } from "@slack/web-api";
import type { Handler } from "aws-lambda";
import { Resource } from "sst";
import type z from "zod";

import { createGeoClient } from "@/geoguessr/client";
import { getPartyJoinLink, isPartyInUse } from "@/geoguessr/helpers/party";
import type { createPartyRequest } from "@/geoguessr/schemas/create-party";
import type { Member } from "@/geoguessr/schemas/member";
import type { Party } from "@/geoguessr/schemas/party";
import { logger } from "@/logger";

const slack = new WebClient(Resource.SlackBotToken.value);

export type CreatePartyEvent = {
  trigger?: "cron" | "slack" | "tests";
  options?: z.input<typeof createPartyRequest>;
};

export type CreatePartyResult = {
  party: Party | null;
  members: Member[];
};

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
    const currentMembers = geoClient.currentMembers();

    if (
      event.trigger === "tests" &&
      isPartyInUse(currentParty, currentMembers)
    ) {
      logger.warn("🎮 The current party is in use, leaving it alone", {
        partyId: currentParty.partyId,
        gameState: currentParty.gameState,
        members: currentMembers,
      });

      return { party: currentParty, members: currentMembers };
    }

    await geoClient.disbandParty();
  }

  const party = await geoClient.createParty(event.options);
  const members = geoClient.currentMembers();

  if (!party) {
    logger.error("❌ Failed to create party", { party });
    return { party: null, members: [] };
  }

  const partyLink = getPartyJoinLink(party);

  if (event.trigger !== "tests") {
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

  return { party, members };
};
