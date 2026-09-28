#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TargetAppStack } from '../lib/target-app-stack';

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
