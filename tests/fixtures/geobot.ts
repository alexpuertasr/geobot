import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { test as base } from "@playwright/test";
import { Resource } from "sst";

import type {
  CreatePartyEvent,
  CreatePartyResult,
} from "../../src/functions/create-party";

export type PlaySessionEvent = {
  channel?: string;
  threadTs?: string;
};

export type Geobot = {
  createParty: (options?: CreatePartyEvent) => Promise<CreatePartyResult>;
  startGame: (event?: PlaySessionEvent) => Promise<void>;
};

export const test = base.extend<{ geobot: Geobot }>({
  geobot: async ({ page: _page }, use) => {
    const lambda = new LambdaClient({});

    await use({
      createParty: async (event = {}) => {
        const { Payload = [] } = await lambda.send(
          new InvokeCommand({
            InvocationType: "RequestResponse",
            FunctionName: Resource.CreateParty.name,
            Payload: Buffer.from(
              JSON.stringify({ ...event, trigger: "tests" }),
            ),
          }),
        );

        return JSON.parse(Buffer.from(Payload).toString()) as CreatePartyResult;
      },
      startGame: async (event = {}) => {
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
