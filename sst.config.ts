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
        cloudflare: "6.15.0",
      },
    };
  },
  async run() {
    const geoguessrCookies = new sst.Secret("GeoguessrCookies");
    const googleMeetsLink = new sst.Secret("GoogleMeetsLink");
    const slackBotToken = new sst.Secret("SlackBotToken");
    const slackChannel = new sst.Secret("SlackChannel");
    const slackSigningSecret = new sst.Secret("SlackSigningSecret");

    const createParty = new sst.aws.Function("CreateParty", {
      runtime: "nodejs24.x",
      handler: "src/functions/create-party.handler",
      link: [geoguessrCookies, googleMeetsLink, slackBotToken, slackChannel],
    });

    const playGame = new sst.aws.Function("PlayGame", {
      runtime: "nodejs24.x",
      timeout: "15 minutes",
      handler: "src/functions/play-game.handler",
      retries: 0,
      link: [geoguessrCookies, slackBotToken],
    });

    const slackRouter = new sst.aws.Router("SlackRouter", {
      domain: {
        name: "slack.geobot.alexpuertasr.dev",
        dns: sst.cloudflare.dns(),
      },
    });

    new sst.aws.Function("SlackHandler", {
      url: { router: { instance: slackRouter } },
      runtime: "nodejs24.x",
      timeout: "30 seconds",
      handler: "src/functions/slack-handler.handler",
      nodejs: {
        esbuild: {
          external: ["@aws-sdk/client-lambda"],
        },
      },
      link: [slackBotToken, slackSigningSecret, createParty, playGame],
    });

    new sst.aws.CronV2("CreatePartyCron", {
      schedule: "cron(15 10 ? * MON-FRI *)",
      timezone: "Australia/Sydney",
      function: createParty.arn,
      event: { trigger: "cron" },
    });

    const githubOidc = aws.iam.getOpenIdConnectProviderOutput({
      url: "https://token.actions.githubusercontent.com",
    });

    const e2eRole = new aws.iam.Role("GithubE2eRole", {
      assumeRolePolicy: $jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Federated: githubOidc.arn },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              },
              StringLike: {
                "token.actions.githubusercontent.com:sub":
                  "repo:alexpuertasr/geobot:*",
              },
            },
          },
        ],
      }),
    });

    new aws.iam.RolePolicy("GithubE2eRolePolicy", {
      role: e2eRole.name,
      policy: $jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["s3:GetObject", "s3:ListBucket"],
            Resource: ["arn:aws:s3:::sst-*", "arn:aws:s3:::sst-*/*"],
          },
          {
            Effect: "Allow",
            Action: ["ssm:GetParameter", "ssm:GetParameters"],
            Resource: "arn:aws:ssm:*:*:parameter/sst*",
          },
          {
            Effect: "Allow",
            Action: "lambda:InvokeFunction",
            Resource: [createParty.arn, playGame.arn],
          },
        ],
      }),
    });

    const deployRole = new aws.iam.Role("GithubDeployRole", {
      assumeRolePolicy: $jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Federated: githubOidc.arn },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub":
                  "repo:alexpuertasr/geobot:ref:refs/heads/main",
              },
            },
          },
        ],
      }),
    });

    new aws.iam.RolePolicyAttachment("GithubDeployRolePolicy", {
      role: deployRole.name,
      policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
    });

    return {
      githubE2eRole: e2eRole.arn,
      githubDeployRole: deployRole.arn,
    };
  },
});
