#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TargetAppStack } from '../lib/target-app-stack';

const app = new cdk.App();

new TargetAppStack(app, 'TargetAppStack', {});
