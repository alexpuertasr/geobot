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

    const startSession = new sst.aws.Function("StartSession", {
      url: true,
      runtime: "nodejs24.x",
      timeout: "30 seconds",
      handler: "src/functions/start-session.handler",
      nodejs: {
        esbuild: {
          external: ["@aws-sdk/client-lambda"],
        },
      },
      link: [slackBotToken, slackSigningSecret, playSession],
    });

    new sst.aws.CronV2("CreatePartyCron", {
      schedule: "cron(15 10 ? * MON-FRI *)",
      timezone: "Australia/Sydney",
      function: {
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
        link: [
          geoguessrCookies,
          googleMeetsLink,
          slackBotToken,
          slackChannel,
          startSession,
        ],
      },
    });
  },
});
