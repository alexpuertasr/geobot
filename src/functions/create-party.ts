import { WebClient } from "@slack/web-api";
import type { Handler } from "aws-lambda";
import { Resource } from "sst";

import {
  type CreatePartyOptions,
  GeoGuessr,
  type Party,
  type PartyData,
} from "@/geoguessr";
import { logger } from "@/logger";

const slack = new WebClient(Resource.SlackBotToken.value);

export type CreatePartyEvent = {
  trigger?: "cron" | "slack" | "tests";
  options?: CreatePartyOptions;
};

export type CreatePartyResult =
  | {
      party: PartyData;
      joinLink: string;
      /**
       * The current party was in use (game running or players present), so
       * a "tests" run kept it instead of disbanding it.
       */
      reused: boolean;
    }
  | { party: null };

const result = (party: Party, reused: boolean): CreatePartyResult => ({
  party: party.data,
  joinLink: party.joinLink,
  reused,
});

export const handler: Handler<CreatePartyEvent, CreatePartyResult> = async (
  event,
  context,
) => {
  logger.addContext(context);

  logger.appendPersistentKeys({ trigger: event.trigger ?? "unknown" });

  await using geoguessr = new GeoGuessr();

  let party: Party;

  try {
    const current = await geoguessr.parties.current();

    if (current) {
      if (event.trigger === "tests" && current.isInUse) {
        logger.warn("🎮 The current party is in use, leaving it alone", {
          partyId: current.id,
          gameState: current.gameState,
          members: current.members,
        });

        return result(current, true);
      }

      await current.disband();
    }

    party = await geoguessr.parties.create(event.options);
  } catch (error) {
    logger.error("❌ Failed to create party", { error });
    return { party: null };
  }

  if (event.trigger !== "tests") {
    const text = `<!here> time to guess!\n:geoguessr: ${party.joinLink}\n:google_meet: ${Resource.GoogleMeetsLink.value}`;

    const response = await slack.chat.postMessage({
      channel: Resource.SlackChannel.value,
      text,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text },
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

    if (response.ok) {
      logger.info(`✅ Slack message sent successfully`);
    } else {
      logger.error(`❌ Slack API error:`, { error: response.error });
    }
  }

  return result(party, false);
};
