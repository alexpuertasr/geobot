import { WebClient } from "@slack/web-api";
import { Resource } from "sst";

import { logger } from "../src/logger.ts";

const {
  GITHUB_EVENT_NAME,
  GITHUB_SERVER_URL,
  GITHUB_REPOSITORY,
  GITHUB_RUN_ID,
} = process.env;

const runName = GITHUB_EVENT_NAME === "schedule" ? "nightly e2e" : "e2e";
const runUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;

const slack = new WebClient(Resource.SlackBotToken.value);

await slack.chat.postMessage({
  channel: Resource.SlackChannel.value,
  text: `🚨 The ${runName} failed, the bot may not work this morning.\n${runUrl}`,
});

logger.info("✅ Slack message sent successfully");
