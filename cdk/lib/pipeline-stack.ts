import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  /**
   * ARN of the AWS CodeStar Connection to GitHub.
   * Create this in the AWS Console under CodeBuild > Settings > Connections.
   */
  readonly githubConnectionArn: string;

  /** GitHub repository owner (e.g., 'malekkhaderr') */
  readonly githubOwner: string;

  /** GitHub repository name (e.g., 'vuln-web-app') */
  readonly githubRepo: string;

  /** Branch that triggers the pipeline on merge (default: 'main') */
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
    // 2. Least-Privilege IAM Role for CDK Deployment
    // ──────────────────────────────────────────────
    const deployRole = new iam.Role(this, 'CodeBuildDeployRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description:
        'Least-privilege role for CodeBuild to deploy the TargetAppStack via CDK',
    });

    // CloudFormation permissions — scoped to the TargetAppStack
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

    // Lambda permissions — create, update, delete functions
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

    // API Gateway permissions
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

    // CloudFront permissions
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
        resources: ['*'], // CloudFront does not support resource-level permissions
      })
    );

    // IAM PassRole — allow CodeBuild to pass the Lambda execution role
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'IamPassRole',
        actions: ['iam:PassRole'],
        resources: [
          `arn:aws:iam::${this.account}:role/TargetAppStack-*`,
        ],
        conditions: {
          StringEquals: {
            'iam:PassedToService': 'lambda.amazonaws.com',
          },
        },
      })
    );

    // IAM role management — CDK creates execution roles for Lambda
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
        resources: [
          `arn:aws:iam::${this.account}:role/TargetAppStack-*`,
        ],
      })
    );

    // SSM Parameter Store — read WAF ACL ARN
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SsmReadWafArn',
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:us-east-1:${this.account}:parameter/vuln-web-app/waf-acl-arn`,
        ],
      })
    );

    // STS — CDK needs to call GetCallerIdentity during synthesis
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'StsGetCallerIdentity',
        actions: ['sts:GetCallerIdentity'],
        resources: ['*'],
      })
    );

    // S3 — CDK asset staging bucket (CDK bootstrap bucket)
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

    // CDK bootstrap — assume the CDK lookup and deploy roles
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-*-${this.region}`,
        ],
      })
    );

    // CloudWatch Logs — for Lambda log groups managed by CDK
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
    // 3. CodeBuild Project
    // ──────────────────────────────────────────────
    const buildProject = new codebuild.Project(this, 'DeployBuildProject', {
      projectName: 'VulnWebApp-DeployPipeline',
      description:
        'DevSecOps pipeline: SAST/SCA → cdk synth (cdk-nag) → Checkov → Deploy → DAST (OWASP ZAP)',
      role: deployRole,

      source: codebuild.Source.gitHub({
        owner: props.githubOwner,
        repo: props.githubRepo,
        branchOrRef: branch,
        webhook: true,
        webhookFilters: [
          // Trigger only on push (merge) to the target branch
          codebuild.FilterGroup.inEventOf(
            codebuild.EventAction.PUSH
          ).andBranchIs(branch),
        ],
      }),

      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
        privileged: true, // Required for Docker (OWASP ZAP DAST container)
      },

      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),

      logging: {
        cloudWatch: {
          logGroup: buildLogGroup,
          enabled: true,
        },
      },

      timeout: cdk.Duration.minutes(30),
    });

    // ──────────────────────────────────────────────
    // 4. Stack Outputs
    // ──────────────────────────────────────────────
    new cdk.CfnOutput(this, 'CodeBuildProjectName', {
      value: buildProject.projectName!,
      description: 'Name of the CodeBuild deployment pipeline project',
    });

    new cdk.CfnOutput(this, 'CodeBuildProjectArn', {
      value: buildProject.projectArn,
      description: 'ARN of the CodeBuild deployment pipeline project',
    });

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
      description: 'ARN of the least-privilege deployment IAM role',
    });
  }
}
