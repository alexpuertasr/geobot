# GeoBot

A serverless AWS Lambda bot for automated GeoGuessr party management and Slack notifications.

## Prerequisites

### AWS Credentials Setup

Before you can deploy this project, you need to configure AWS credentials. SST will automatically use your AWS credentials to deploy resources.

#### Option 1: AWS Credentials File (Recommended)

Create or update your AWS credentials file:

**macOS/Linux:** `~/.aws/credentials`
**Windows:** `C:\Users\USER_NAME\.aws\credentials`

```ini
[default]
aws_access_key_id = YOUR_ACCESS_KEY_ID
aws_secret_access_key = YOUR_SECRET_ACCESS_KEY
```

If you don't have AWS credentials yet:

1. [Create an IAM user](https://sst.dev/chapters/create-an-iam-user.html)
2. [Configure the AWS CLI](https://sst.dev/chapters/configure-the-aws-cli.html)

#### Option 2: Environment Variables

Set these environment variables:

```bash
export AWS_ACCESS_KEY_ID=your_access_key_id
export AWS_SECRET_ACCESS_KEY=your_secret_access_key
# Optional for temporary credentials:
export AWS_SESSION_TOKEN=your_session_token
```

#### Multiple AWS Profiles

If you have multiple AWS accounts, you can configure multiple profiles:

```ini
[default]
aws_access_key_id = DEFAULT_ACCESS_KEY_ID
aws_secret_access_key = DEFAULT_SECRET_ACCESS_KEY

[staging]
aws_access_key_id = STAGING_ACCESS_KEY_ID
aws_secret_access_key = STAGING_SECRET_ACCESS_KEY

[production]
aws_access_key_id = PRODUCTION_ACCESS_KEY_ID
aws_secret_access_key = PRODUCTION_SECRET_ACCESS_KEY
```

Then specify the profile in `sst.config.ts`:

```typescript
providers: {
  aws: {
    profile: "staging"; // or use input.stage to switch profiles per stage
  }
}
```

### Slack Configuration

You'll need to set up Slack secrets for the bot to work:

```bash
# Set your Slack bot token
pnpx sst secret set SlackBotToken "xoxb-your-slack-bot-token"

# Set your Slack channel ID or name
pnpx sst secret set SlackChannel "#your-channel-name"
```

### GitHub Actions (scheduled e2e)

The [E2E workflow](.github/workflows/e2e.yml) runs the Playwright test on a schedule against the deployed stage, authenticating to AWS via GitHub OIDC.

The OIDC provider is an account-level singleton that `sst.config.ts` only references, so it must be created once per AWS account:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Deploying then creates the role and prints its ARN as the `githubE2eRole` output. Set these repository variables (Settings → Secrets and variables → Actions → Variables):

- `AWS_ROLE_ARN` — the `githubE2eRole` ARN from the deploy output
- `AWS_DEPLOY_ROLE_ARN` — the `githubDeployRole` ARN from the deploy output
- `AWS_REGION` — the region the app is deployed to (must match `sst.config.ts`)
- `SST_STAGE` — the stage the workflows deploy and test against

## Getting Started

### Development

Start the SST development server:

```bash
pnpx sst dev
```

This will:

- Deploy your Lambda functions to AWS
- Set up the cron schedule
- Enable live development with instant updates

### Deployment

Deploy to production:

```bash
pnpx sst deploy --stage production
```

## Project Structure

- `src/functions/` - Lambda handlers (Slack commands, party creation, game driver)
- `src/geoguessr/` - GeoGuessr client layer (HTTP + WebSocket protocol)
- `sst.config.ts` - SST infrastructure configuration with cron scheduling
- `sst-env.d.ts` - Auto-generated TypeScript definitions for SST resources
