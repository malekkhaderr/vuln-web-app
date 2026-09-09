import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SecurityCiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Source Definition & Webhook Configuration
    const source = codebuild.Source.gitHub({
      owner: 'malekkhaderr',
      repo: 'vuln-web-app',
      cloneDepth: 0, // CRITICAL: 0 specifies a full git clone required for scanning historical commits
      webhookFilters: [
        codebuild.FilterGroup.inEventOf(
          codebuild.EventAction.PULL_REQUEST_CREATED,
          codebuild.EventAction.PULL_REQUEST_UPDATED,
          codebuild.EventAction.PUSH
        ),
      ],
    });

    // 2. CodeBuild Project Definition
    new codebuild.Project(this, 'GitleaksScanProject', {
      projectName: 'vuln-web-app-secret-scan',
      source: source,
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
    });
  }
}