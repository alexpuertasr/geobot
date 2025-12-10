import { Resource } from "sst";

export const handler = async () => {
  try {
    console.log("🚀 Geobot started at:", new Date().toISOString());

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Resource.SlackBotToken.value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: Resource.SlackChannel.value,
        text: "🚧 I'm still under development, please previous winner set the session 🏆⚙️",
      }),
    });

    const result = (await response.json()) as { ok: boolean; error?: string };

    if (response.ok && result.ok) {
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
