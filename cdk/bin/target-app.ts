#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TargetAppStack } from '../lib/target-app-stack';
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
const webAclArn = process.env.WEB_ACL_ARN;

if (!webAclArn) {
  throw new Error('WEB_ACL_ARN must be configured');
}

new TargetAppStack(app, 'TargetAppStack', {
  env,
  webAclArn,
});

const connectionArn = process.env.CODESTAR_CONNECTION_ARN;

if (connectionArn) {
  new PipelineStack(app, 'PipelineStack', {
    env,
    githubOwner: process.env.GITHUB_OWNER || 'malekkhaderr',
    githubRepo: process.env.GITHUB_REPO || 'vuln-web-app',
    githubBranch: process.env.GITHUB_BRANCH || 'main',
    connectionArn,
    targetAppUrl: process.env.TARGET_APP_URL,
  });
}
