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

- `src/create-party.ts` - Main Lambda handler for the bot functionality
- `sst.config.ts` - SST infrastructure configuration with cron scheduling
- `sst-env.d.ts` - Auto-generated TypeScript definitions for SST resources
