#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TargetAppStack } from '../lib/target-app-stack';
import { SecurityPipelineStack } from '../lib/security-pipeline-stack';

const app = new cdk.App();

// Explicitly resolve account and region from environment variables
const env: cdk.Environment = {
  account: '746851697874',
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
};

const webAclArn =
  app.node.tryGetContext('webAclArn') || process.env.WEB_ACL_ARN || '';

const githubConnectionArn =
  app.node.tryGetContext('githubConnectionArn') || process.env.GITHUB_CONNECTION_ARN || '';

const githubOwner =
  app.node.tryGetContext('githubOwner') || process.env.GITHUB_OWNER || 'malekkhaderr';

const githubRepo =
  app.node.tryGetContext('githubRepo') || process.env.GITHUB_REPO || 'vuln-web-app';

const githubBranch =
  app.node.tryGetContext('githubBranch') || process.env.GITHUB_BRANCH || 'main';

// 1. Target Application Stack
new TargetAppStack(app, 'TargetAppStack', {
  env,
  webAclArn,
});

// 2. Security Pipeline Stack
new SecurityPipelineStack(app, 'SecurityPipelineStack', {
  env,
  githubConnectionArn,
  githubOwner,
  githubRepo,
  githubBranch,
  webAclArn,
});