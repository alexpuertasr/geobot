/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app() {
    return {
      name: "geobot",
      removal: "remove",
      home: "aws",
      providers: {
        aws: {
          region: "ap-southeast-2",
        },
      },
    };
  },
  async run() {
    const geoguessrCookies = new sst.Secret("GeoguessrCookies");
    const googleMeetsLink = new sst.Secret("GoogleMeetsLink");
    const slackBotToken = new sst.Secret("SlackBotToken");
    const slackChannel = new sst.Secret("SlackChannel");
    const slackSigningSecret = new sst.Secret("SlackSigningSecret");

    const playSession = new sst.aws.Function("PlaySession", {
      url: $dev,
      memory: "2 GB",
      runtime: "nodejs24.x",
      timeout: "10 minutes",
      handler: "src/functions/play-session.handler",
      nodejs: {
        install: ["@sparticuz/chromium"],
        esbuild: {
          external: ["yargs"],
        },
      },
      link: [geoguessrCookies, slackBotToken],
    });

    const createParty = new sst.aws.Function("CreateParty", {
      runtime: "nodejs24.x",
      memory: "2 GB",
      timeout: "5 minutes",
      handler: "src/functions/create-party.handler",
      nodejs: {
        install: ["@sparticuz/chromium"],
        esbuild: {
          external: ["yargs"],
        },
      },
      link: [geoguessrCookies, googleMeetsLink, slackBotToken, slackChannel],
    });

    new sst.aws.Function("SlackHandler", {
      url: true,
      // Pinned to Node 22 until slackapi/bolt-js#2970 ships: Node 24 rejects
      // Bolt 4.7.3's callback-arity AwsLambdaReceiver handler.
      runtime: "nodejs22.x",
      timeout: "30 seconds",
      handler: "src/functions/slack-handler.handler",
      nodejs: {
        esbuild: {
          external: ["@aws-sdk/client-lambda"],
        },
      },
      link: [slackBotToken, slackSigningSecret, playSession, createParty],
    });

    new sst.aws.CronV2("CreatePartyCron", {
      schedule: "cron(15 10 ? * MON-FRI *)",
      timezone: "Australia/Sydney",
      function: createParty.arn,
    });
  },
});
