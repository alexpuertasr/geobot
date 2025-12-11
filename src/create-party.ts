import { Resource } from "sst";
import { WebClient } from "@slack/web-api";

const slack = new WebClient(Resource.SlackBotToken.value);

export const handler = async () => {
  try {
    console.log("🚀 Geobot started at:", new Date().toISOString());

    const result = await slack.chat.postMessage({
      text: "🚧 I'm still under development, please previous winner set the session 🏆⚙️",
      channel: Resource.SlackChannel.value,
    });

    if (result.ok) {
      console.log(`✅ Slack message sent successfully`);
    } else {
      console.error(`❌ Slack API error:`, result.error || "Unknown error");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Success" }),
    };
  } catch (error) {
    console.error(`💥 Failed to send Slack message:`, error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to execute" }),
    };
  }
};
