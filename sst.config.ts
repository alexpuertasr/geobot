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
    const slackBotToken = new sst.Secret("SlackBotToken");
    const slackChannel = new sst.Secret("SlackChannel");

    new sst.aws.Cron("CreatePartyCron", {
      schedule: "cron(15 23 ? * SUN-THU *)",
      function: {
        handler: "src/create-party.handler",
        link: [slackBotToken, slackChannel],
      },
    });
  },
});
