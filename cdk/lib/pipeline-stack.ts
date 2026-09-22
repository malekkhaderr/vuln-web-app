import * as cdk from 'aws-cdk-lib';
import { Construct as construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';

export interface PipelineStackProps extends cdk.StackProps {
  readonly githubConnectionArn: string;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly githubBranch: string;
  readonly stagingWafParameterName: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const sourceOutput = new codepipeline.Artifact('Source');
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'VulnWebAppPipeline',
    });
    const applicationValidationProject = new codebuild.Project(
      this,
      'ApplicationValidationProject',
      {
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.SMALL,
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': {
                nodejs: '22',
              },
              commands: ['npm ci'],
            },
            build: {
              commands: ['npm run format:check', 'npm run lint'],
            },
          },
        }),
      }
    );

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipelineActions.CodeStarConnectionsSourceAction({
          actionName: 'GitHubSource',
          owner: props.githubOwner,
          repo: props.githubRepo,
          branch: props.githubBranch,
          connectionArn: props.githubConnectionArn,
          output: sourceOutput,
        }),
      ],
    });
  }
}
