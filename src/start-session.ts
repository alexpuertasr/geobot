import { App, AwsLambdaReceiver } from "@slack/bolt";
import { Resource } from "sst";

const receiver = new AwsLambdaReceiver({
  signingSecret: Resource.SlackSigningSecret.value,
});

const app = new App({
  token: Resource.SlackBotToken.value,
  receiver,
});

app.action("start_session", async ({ client, body, ack }) => {
  await ack();

  const message = body.type === "block_actions" ? body.message : undefined;
  if (!message) return;

  const channel = body.channel?.id;
  if (!channel) return;

  const updatedBlocks = (message.blocks ?? [])
    .filter((block: { type: string }) => block.type !== "actions")
    .concat({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `▶️ Session started by <@${body.user.id}>`,
      },
    });

  await client.chat.update({
    channel,
    ts: message.ts,
    blocks: updatedBlocks,
    text: "Session started",
  });

  await client.chat.postMessage({
    channel,
    thread_ts: message.ts,
    text: "🚧 I'm still under development, please previous winner manage the session 🏆⚙️",
  });
});

export const handler = receiver.toHandler();
