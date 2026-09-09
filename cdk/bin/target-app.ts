#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TargetAppStack } from '../lib/target-app-stack';
import { WafStack } from '../lib/waf-stack';
import { SecurityCiStack } from '../lib/security-ci-check';
const app = new cdk.App();

// 1. Deploy WAF to us-east-1
const wafStack = new WafStack(app, 'WafStack', {
  env: { region: 'us-east-1' }, // CloudFront-scoped WAF must be in us-east-1
  crossRegionReferences: true,
});

// 2. Deploy Target Stack in your main region (e.g., eu-west-1 or us-east-1)
new TargetAppStack(app, 'TargetAppStack', {
  env: {
    region: 'eu-west-1', // Change this to your desired region
  },
  crossRegionReferences: true,
  webAclArn: wafStack.webAclArn,
});

new SecurityCiStack(app, 'SecurityCiStack', {
  env: {
    region: 'eu-west-1', // Change this to your desired region
  },
  crossRegionReferences: true,
});
