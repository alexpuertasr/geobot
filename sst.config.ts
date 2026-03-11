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

    new sst.aws.CronV2("CreatePartyCron", {
      schedule: "cron(15 10 ? * MON-FRI *)",
      timezone: "Australia/Sydney",
      function: {
        memory: "2 GB",
        timeout: "15 minutes",
        handler: "src/create-party.handler",
        nodejs: {
          install: ["@sparticuz/chromium"],
        },
        link: [geoguessrCookies, googleMeetsLink, slackBotToken, slackChannel],
      },
    });
  },
});
