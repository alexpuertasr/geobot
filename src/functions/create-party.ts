import { WebClient } from "@slack/web-api";
import type { Context } from "aws-lambda";
import { Resource } from "sst";

import { getPartyPageProps } from "../get-party-page-props";
import { logger } from "../logger";

const slack = new WebClient(Resource.SlackBotToken.value);

type CreatePartyEvent = {
  trigger?: "cron" | "slack";
};

export const handler = async (
  event: CreatePartyEvent = {},
  context: Context,
) => {
  logger.addContext(context);

  logger.appendPersistentKeys({ trigger: event.trigger ?? "unknown" });

  try {
    const { party } = await getPartyPageProps();

    const partyLink = `https://www.geoguessr.com/join/${party.joinCode.code}?s=Url`;
    logger.info("📄 Party link", {
      partyId: party.partyId,
      partyLink,
    });

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
              action_id: "start_session",
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

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Success" }),
    };
  } catch (error) {
    logger.error(`💥 Failed to create party:`, { error });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to execute" }),
    };
  }
};
