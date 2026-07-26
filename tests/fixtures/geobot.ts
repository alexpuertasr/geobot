import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { test as base } from "@playwright/test";
import { Resource } from "sst";

export type PlaySessionEvent = {
  channel?: string;
  threadTs?: string;
};

export type Geobot = {
  playSession: (event?: PlaySessionEvent) => Promise<void>;
};

export const test = base.extend<{ geobot: Geobot }>({
  geobot: async ({ page: _page }, use) => {
    const lambda = new LambdaClient({ region: "ap-southeast-2" });

    await use({
      playSession: async (event = {}) => {
        await lambda.send(
          new InvokeCommand({
            InvocationType: "Event",
            FunctionName: Resource.PlaySession.name,
            Payload: Buffer.from(
              JSON.stringify({ ...event, trigger: "tests" }),
            ),
          }),
        );
      },
    });
  },
});
