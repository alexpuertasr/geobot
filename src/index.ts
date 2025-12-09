export default {
  async scheduled(event, env): Promise<void> {
    try {
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: env.SLACK_CHANNEL,
          text: "🚧 I'm still under development, please previous winner set the session 🏆⚙️",
        }),
      });

      const result = (await response.json()) as { ok: boolean; error?: string };

      if (response.ok && result.ok) {
        console.log(`✅ Slack message sent successfully at ${event.cron}`);
      } else {
        console.error(`❌ Slack API error:`, result.error || "Unknown error");
      }
    } catch (error) {
      console.error(`💥 Failed to send Slack message:`, error);
    }
  },
} satisfies ExportedHandler<Env>;
