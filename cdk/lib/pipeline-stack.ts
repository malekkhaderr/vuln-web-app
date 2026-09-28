import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  readonly githubConnectionArn: string;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly githubBranch?: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const branch = props.githubBranch ?? 'main';

    // ──────────────────────────────────────────────
    // 1. CloudWatch Log Group for CodeBuild logs
    // ──────────────────────────────────────────────
    const buildLogGroup = new logs.LogGroup(this, 'BuildLogGroup', {
      logGroupName: '/codebuild/vuln-web-app-pipeline',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ──────────────────────────────────────────────
    // 2. Least-Privilege IAM Role for CodeBuild
    // ──────────────────────────────────────────────
    const deployRole = new iam.Role(this, 'CodeBuildDeployRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description:
        'Least-privilege role for CodeBuild to deploy the TargetAppStack via CDK',
    });

    // CloudFormation — scoped to TargetAppStack
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudFormationDeploy',
        actions: [
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:GetTemplate',
          'cloudformation:CreateChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DeleteChangeSet',
          'cloudformation:DescribeChangeSet',
        ],
        resources: [
          `arn:aws:cloudformation:${this.region}:${this.account}:stack/TargetAppStack/*`,
        ],
      })
    );

    // Lambda
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'LambdaDeploy',
        actions: [
          'lambda:CreateFunction',
          'lambda:UpdateFunctionCode',
          'lambda:UpdateFunctionConfiguration',
          'lambda:DeleteFunction',
          'lambda:GetFunction',
          'lambda:GetFunctionConfiguration',
          'lambda:AddPermission',
          'lambda:RemovePermission',
          'lambda:TagResource',
          'lambda:UntagResource',
          'lambda:ListTags',
          'lambda:PublishVersion',
        ],
        resources: [
          `arn:aws:lambda:${this.region}:${this.account}:function:TargetAppStack-*`,
        ],
      })
    );

    // API Gateway
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ApiGatewayDeploy',
        actions: [
          'apigateway:POST',
          'apigateway:GET',
          'apigateway:PATCH',
          'apigateway:PUT',
          'apigateway:DELETE',
        ],
        resources: [`arn:aws:apigateway:${this.region}::/*`],
      })
    );

    // CloudFront
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudFrontDeploy',
        actions: [
          'cloudfront:CreateDistribution',
          'cloudfront:UpdateDistribution',
          'cloudfront:DeleteDistribution',
          'cloudfront:GetDistribution',
          'cloudfront:GetDistributionConfig',
          'cloudfront:TagResource',
          'cloudfront:UntagResource',
        ],
        resources: ['*'],
      })
    );

    // IAM PassRole
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'IamPassRole',
        actions: ['iam:PassRole'],
        resources: [`arn:aws:iam::${this.account}:role/TargetAppStack-*`],
        conditions: {
          StringEquals: {
            'iam:PassedToService': 'lambda.amazonaws.com',
          },
        },
      })
    );

    // IAM Role Management
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'IamRoleManagement',
        actions: [
          'iam:CreateRole',
          'iam:DeleteRole',
          'iam:AttachRolePolicy',
          'iam:DetachRolePolicy',
          'iam:PutRolePolicy',
          'iam:DeleteRolePolicy',
          'iam:GetRole',
          'iam:GetRolePolicy',
          'iam:TagRole',
          'iam:UntagRole',
        ],
        resources: [`arn:aws:iam::${this.account}:role/TargetAppStack-*`],
      })
    );

    // SSM — read WAF ACL ARN
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SsmReadWafArn',
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:us-east-1:${this.account}:parameter/vuln-web-app/waf-acl-arn`,
        ],
      })
    );

    // STS
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'StsGetCallerIdentity',
        actions: ['sts:GetCallerIdentity'],
        resources: ['*'],
      })
    );

    // S3 — CDK asset staging bucket
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CdkStagingBucket',
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:ListBucket',
          's3:GetBucketLocation',
        ],
        resources: [
          `arn:aws:s3:::cdk-*-assets-${this.account}-${this.region}`,
          `arn:aws:s3:::cdk-*-assets-${this.account}-${this.region}/*`,
        ],
      })
    );

    // CDK bootstrap roles
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*-${this.region}`],
      })
    );

    // CloudWatch Logs for Lambda
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsDeploy',
        actions: [
          'logs:CreateLogGroup',
          'logs:DeleteLogGroup',
          'logs:PutRetentionPolicy',
          'logs:DeleteRetentionPolicy',
          'logs:DescribeLogGroups',
          'logs:TagResource',
          'logs:UntagResource',
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/TargetAppStack-*`,
        ],
      })
    );

    // ──────────────────────────────────────────────
    // 3. CodeBuild Project (used as the build action in CodePipeline)
    // ──────────────────────────────────────────────
    const buildProject = new codebuild.PipelineProject(
      this,
      'DeployBuildProject',
      {
        projectName: 'VulnWebApp-DeployBuild',
        description:
          'DevSecOps: SAST/SCA, cdk synth (cdk-nag), Checkov, Deploy, DAST (OWASP ZAP)',
        role: deployRole,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.MEDIUM,
          privileged: true,
        },
        buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
        logging: {
          cloudWatch: {
            logGroup: buildLogGroup,
            enabled: true,
          },
        },
        timeout: cdk.Duration.minutes(30),
      }
    );

    // ──────────────────────────────────────────────
    // 4. CodePipeline — Source + Build stages
    // ──────────────────────────────────────────────
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    const pipeline = new codepipeline.Pipeline(this, 'DeployPipeline', {
      pipelineName: 'VulnWebApp-DeployPipeline',
      restartExecutionOnUpdate: true,
    });

    // Stage 1: Source — pull code from GitHub on merge to main
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipelineActions.CodeStarConnectionsSourceAction({
          actionName: 'GitHub-Source',
          owner: props.githubOwner,
          repo: props.githubRepo,
          branch,
          connectionArn: props.githubConnectionArn,
          output: sourceOutput,
          triggerOnPush: true,
        }),
      ],
    });

    // Stage 2: Build — runs the full DevSecOps buildspec
    pipeline.addStage({
      stageName: 'SecurityScan-Build-Deploy',
      actions: [
        new codepipelineActions.CodeBuildAction({
          actionName: 'DevSecOps-Pipeline',
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // ──────────────────────────────────────────────
    // 5. Stack Outputs
    // ──────────────────────────────────────────────
    new cdk.CfnOutput(this, 'PipelineName', {
      value: pipeline.pipelineName,
      description: 'Name of the CodePipeline',
    });

    new cdk.CfnOutput(this, 'PipelineArn', {
      value: pipeline.pipelineArn,
      description: 'ARN of the CodePipeline',
    });

    new cdk.CfnOutput(this, 'CodeBuildProjectName', {
      value: buildProject.projectName,
      description: 'Name of the CodeBuild project used by the pipeline',
    });

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
      description: 'ARN of the least-privilege deployment IAM role',
    });
  }
}
