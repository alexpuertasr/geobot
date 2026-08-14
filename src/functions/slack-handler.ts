import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { App, AwsLambdaReceiver } from "@slack/bolt";
import { Resource } from "sst";

const receiver = new AwsLambdaReceiver({
  signingSecret: Resource.SlackSigningSecret.value,
});

const app = new App({
  token: Resource.SlackBotToken.value,
  receiver,
});

const lambda = new LambdaClient({});

app.command("/create-party", async ({ ack }) => {
  await ack("🌍 Creating a party…");

  await lambda.send(
    new InvokeCommand({
      InvocationType: "Event",
      FunctionName: Resource.CreateParty.name,
      Payload: Buffer.from(JSON.stringify({ trigger: "slack" })),
    }),
  );
});

app.command("/play-game", async ({ ack, command }) => {
  await ack("🌍 Starting a game…");

  await lambda.send(
    new InvokeCommand({
      InvocationType: "Event",
      FunctionName: Resource.PlayGame.name,
      Payload: Buffer.from(
        JSON.stringify({ trigger: "slack", channel: command.user_id }),
      ),
    }),
  );
});

app.action("start_game", async ({ client, body, ack }) => {
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
        text: `▶️ Game started by <@${body.user.id}>`,
      },
    });

  await client.chat.update({
    channel,
    ts: message.ts,
    blocks: updatedBlocks,
    text: "Game started",
  });

  await client.chat.postMessage({
    channel,
    thread_ts: message.ts,
    text: "🎮 Starting the game — good luck everyone!",
  });

  await lambda.send(
    new InvokeCommand({
      InvocationType: "Event",
      FunctionName: Resource.PlayGame.name,
      Payload: Buffer.from(
        JSON.stringify({ trigger: "slack", channel, threadTs: message.ts }),
      ),
    }),
  );
});

export const handler = receiver.toHandler();
