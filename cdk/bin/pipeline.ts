#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

const required = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} must be configured`);
  }

  return value;
};

const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;

if (!account) {
  throw new Error('CDK_DEFAULT_ACCOUNT or AWS_ACCOUNT_ID must be configured');
}

new PipelineStack(app, 'PipelineStack', {
  env: {
    account,
    region:
      process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'eu-west-1',
  },
  githubConnectionArn: required('GITHUB_CONNECTION_ARN'),
  githubOwner: process.env.GITHUB_OWNER || 'malekkhaderr',
  githubRepo: process.env.GITHUB_REPO || 'vuln-web-app',
  githubBranch: process.env.GITHUB_BRANCH || 'main',
  stagingWafParameterName:
    process.env.STAGING_WAF_PARAMETER_NAME ||
    '/vuln-web-app/staging/web-acl-arn',
});
