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
    // 1. CloudWatch Log Group
    // ──────────────────────────────────────────────
    const buildLogGroup = new logs.LogGroup(this, 'BuildLogGroup', {
      logGroupName: '/codebuild/vuln-web-app-pipeline',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ──────────────────────────────────────────────
    // 2. Least-Privilege IAM Role for all CodeBuild projects
    // ──────────────────────────────────────────────
    const deployRole = new iam.Role(this, 'CodeBuildDeployRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'Least-privilege role for pipeline CodeBuild projects',
    });

    // CloudFormation Describe (Needs *)
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudFormationDescribe',
        actions: [
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeChangeSet',
        ],
        resources: ['*'],
      })
    );

    // CloudFormation
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudFormationDeploy',
        actions: [
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DeleteStack',
          'cloudformation:GetTemplate',
          'cloudformation:CreateChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DeleteChangeSet',
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

    // IAM PassRole + Role Management
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

    // SSM
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SsmReadWafArn',
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:eu-west-1:${this.account}:parameter/vuln-web-app/staging/web-acl-arn`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*/version`,
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

    // S3 CDK staging
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CdkStagingBucket',
        actions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket', 's3:GetBucketLocation'],
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

    // CloudWatch Logs
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
    // 3. Shared build environment config
    // ──────────────────────────────────────────────
    const buildEnvironment: codebuild.BuildEnvironment = {
      buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      computeType: codebuild.ComputeType.MEDIUM,
      privileged: true,
    };

    const cloudWatchLogging: codebuild.LoggingOptions = {
      cloudWatch: { logGroup: buildLogGroup, enabled: true },
    };

    // ──────────────────────────────────────────────
    // Stage 2: Security Scan (Trivy SCA + Secret Scan)
    // ──────────────────────────────────────────────
    const securityScanProject = new codebuild.PipelineProject(
      this,
      'SecurityScanProject',
      {
        projectName: 'VulnWebApp-SecurityScan',
        description: 'Trivy SCA dependency and secret scanning',
        role: deployRole,
        environment: buildEnvironment,
        logging: cloudWatchLogging,
        timeout: cdk.Duration.minutes(15),
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': { nodejs: 22 },
              commands: [
                'curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin',
                'trivy --version',
              ],
            },
            pre_build: {
              commands: [
                'npm ci',
                'cd cdk && npm ci && cd ..',
              ],
            },
            build: {
              commands: [
                'echo "Running Trivy SCA and Secret scan..."',
                'trivy fs --security-checks vuln,secret --severity HIGH,CRITICAL --exit-code 0 --ignore-unfixed .',
              ],
            },
          },
        }),
      }
    );

    // ──────────────────────────────────────────────
    // Stage 3: CDK Synth + IaC Security Scan (Checkov)
    // ──────────────────────────────────────────────
    const buildSynthProject = new codebuild.PipelineProject(
      this,
      'BuildSynthProject',
      {
        projectName: 'VulnWebApp-BuildSynth',
        description: 'CDK synthesis with cdk-nag and Checkov IaC scanning',
        role: deployRole,
        environment: buildEnvironment,
        logging: cloudWatchLogging,
        timeout: cdk.Duration.minutes(15),
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          env: {
            'exported-variables': ['WEB_ACL_ARN', 'CDK_DEFAULT_ACCOUNT', 'CDK_DEFAULT_REGION'],
          },
          phases: {
            install: {
              'runtime-versions': { nodejs: 22, python: 3.11 },
              commands: [
                'npm install -g aws-cdk',
                'pip3 install --no-cache-dir checkov',
              ],
            },
            pre_build: {
              commands: [
                'npm ci',
                'cd cdk && npm ci && cd ..',
              ],
            },
            build: {
              commands: [
                'export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)',
                'export CDK_DEFAULT_REGION=${AWS_DEFAULT_REGION:-eu-west-1}',
                'export WEB_ACL_ARN=$(aws ssm get-parameter --name /vuln-web-app/staging/web-acl-arn --query Parameter.Value --output text --region eu-west-1 2>/dev/null || echo "")',
                'if [ -z "$WEB_ACL_ARN" ]; then export WEB_ACL_ARN="arn:aws:wafv2:us-east-1:${CDK_DEFAULT_ACCOUNT}:global/webacl/ci-placeholder/ci-placeholder"; fi',
                'cd cdk && npx cdk synth --app "npx tsx bin/target-app.ts" -o cdk.out && cd ..',
                'echo "Running Checkov IaC scan..."',
                'checkov -d cdk/cdk.out --config-file .checkov.yml --framework cloudformation --compact || true',
              ],
            },
          },
        }),
      }
    );

    // ──────────────────────────────────────────────
    // Stage 4: CDK Deploy
    // ──────────────────────────────────────────────
    const deployProject = new codebuild.PipelineProject(
      this,
      'DeployProject',
      {
        projectName: 'VulnWebApp-Deploy',
        description: 'CDK deploy TargetAppStack to AWS',
        role: deployRole,
        environment: buildEnvironment,
        logging: cloudWatchLogging,
        timeout: cdk.Duration.minutes(20),
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': { nodejs: 22 },
              commands: [
                'npm install -g aws-cdk',
              ],
            },
            pre_build: {
              commands: [
                'npm ci',
                'cd cdk && npm ci && cd ..',
              ],
            },
            build: {
              commands: [
                'export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)',
                'export CDK_DEFAULT_REGION=${AWS_DEFAULT_REGION:-eu-west-1}',
                'export WEB_ACL_ARN=$(aws ssm get-parameter --name /vuln-web-app/staging/web-acl-arn --query Parameter.Value --output text --region eu-west-1 2>/dev/null || echo "")',
                'if [ -z "$WEB_ACL_ARN" ]; then export WEB_ACL_ARN="arn:aws:wafv2:us-east-1:${CDK_DEFAULT_ACCOUNT}:global/webacl/ci-placeholder/ci-placeholder"; fi',
                'echo "Deploying TargetAppStack..."',
                'cd cdk && npx cdk deploy TargetAppStack --app "npx tsx bin/target-app.ts" --require-approval never --outputs-file ../outputs.json && cd ..',
                'cat outputs.json',
              ],
            },
          },
          artifacts: {
            files: ['outputs.json'],
          },
        }),
      }
    );

    // ──────────────────────────────────────────────
    // Stage 5: DAST (OWASP ZAP)
    // ──────────────────────────────────────────────
    const dastProject = new codebuild.PipelineProject(
      this,
      'DastProject',
      {
        projectName: 'VulnWebApp-DAST',
        description: 'OWASP ZAP baseline DAST scan against deployed CloudFront',
        role: deployRole,
        environment: buildEnvironment,
        logging: cloudWatchLogging,
        timeout: cdk.Duration.minutes(15),
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': { python: 3.11 },
              commands: [
                'docker --version',
              ],
            },
            build: {
              commands: [
                'export TARGET_URL=$(python3 -c "import json; print(json.load(open(\'outputs.json\'))[\'TargetAppStack\'][\'CloudFrontUrl\'])")',
                'echo "DAST Target: $TARGET_URL"',
                'mkdir -p reports',
                'docker run --rm -v $(pwd)/reports:/zap/wrk/:rw zaproxy/zap-stable zap-baseline.py -t $TARGET_URL -r zap-report.html -J zap-report.json -l WARN || true',
                'echo "DAST scan complete. Reports saved to reports/"',
              ],
            },
          },
          artifacts: {
            files: ['reports/**/*'],
          },
        }),
      }
    );

    // ──────────────────────────────────────────────
    // 4. CodePipeline with 5 stages
    // ──────────────────────────────────────────────
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const deployOutput = new codepipeline.Artifact('DeployOutput');
    const dastOutput = new codepipeline.Artifact('DastOutput');

    const pipeline = new codepipeline.Pipeline(this, 'DeployPipeline', {
      pipelineName: 'VulnWebApp-DeployPipeline',
      restartExecutionOnUpdate: true,
    });

    // Stage 1: Source
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

    // Stage 2: Security Scan
    pipeline.addStage({
      stageName: 'SecurityScan',
      actions: [
        new codepipelineActions.CodeBuildAction({
          actionName: 'Trivy-SCA-SecretScan',
          project: securityScanProject,
          input: sourceOutput,
        }),
      ],
    });

    // Stage 3: Build and Synth
    pipeline.addStage({
      stageName: 'Build-Synth-IaC',
      actions: [
        new codepipelineActions.CodeBuildAction({
          actionName: 'CDK-Synth-Checkov',
          project: buildSynthProject,
          input: sourceOutput,
        }),
      ],
    });

    // Stage 4: Deploy
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new codepipelineActions.CodeBuildAction({
          actionName: 'CDK-Deploy',
          project: deployProject,
          input: sourceOutput,
          outputs: [deployOutput],
        }),
      ],
    });

    // Stage 5: DAST
    pipeline.addStage({
      stageName: 'DAST',
      actions: [
        new codepipelineActions.CodeBuildAction({
          actionName: 'OWASP-ZAP-Scan',
          project: dastProject,
          input: deployOutput,
          outputs: [dastOutput],
        }),
      ],
    });

    // ──────────────────────────────────────────────
    // 5. Stack Outputs
    // ──────────────────────────────────────────────
    new cdk.CfnOutput(this, 'PipelineName', {
      value: pipeline.pipelineName,
    });

    new cdk.CfnOutput(this, 'PipelineArn', {
      value: pipeline.pipelineArn,
    });

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
    });
  }
}
