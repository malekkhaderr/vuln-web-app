#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;

if (!account) {
  throw new Error('CDK_DEFAULT_ACCOUNT or AWS_ACCOUNT_ID must be configured');
}

const env: cdk.Environment = {
  account,
  region:
    process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'eu-west-1',
};

// These values must be configured via environment variables or CDK context
const githubConnectionArn =
  process.env.GITHUB_CONNECTION_ARN ||
  app.node.tryGetContext('githubConnectionArn');

const githubOwner =
  process.env.GITHUB_OWNER ||
  app.node.tryGetContext('githubOwner') ||
  'malekkhaderr';

const githubRepo =
  process.env.GITHUB_REPO ||
  app.node.tryGetContext('githubRepo') ||
  'vuln-web-app';

if (!githubConnectionArn) {
  throw new Error(
    'GITHUB_CONNECTION_ARN must be set (env var or CDK context -c githubConnectionArn=arn:...)'
  );
}

new PipelineStack(app, 'PipelineStack', {
  env,
  githubConnectionArn,
  githubOwner,
  githubRepo,
  githubBranch: 'main',
});
