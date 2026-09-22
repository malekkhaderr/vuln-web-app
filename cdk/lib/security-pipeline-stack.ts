import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SecurityPipelineStackProps extends cdk.StackProps {
  readonly githubConnectionArn: string;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly githubBranch?: string;
  readonly webAclArn: string;
}

export class SecurityPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SecurityPipelineStackProps) {
    super(scope, id, props);

    const branch = props.githubBranch || 'main';

    // ------------------------------------------------------------------
    // 1. CodeBuild Projects (Primary Build + Security Scanners + Deploy)
    // ------------------------------------------------------------------

    // A. Primary CDK Build & Synth Project
    const cdkBuildProject = new codebuild.Project(this, 'CdkBuildProject', {
      projectName: 'vuln-web-app-cdk-build',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: 20 },
            commands: ['cd cdk && npm ci --loglevel=error'],
          },
          build: {
            commands: [
              'echo "[*] Synthesizing CDK stacks and bundling Lambda functions..."',
              `npx cdk synth TargetAppStack --app "npx tsx bin/target-app.ts" -c "webAclArn=${props.webAclArn}"`,
            ],
          },
        },
        artifacts: {
          'base-directory': 'cdk',
          files: ['**/*'],
        },
      }),
    });

    const repoSource = codebuild.Source.gitHub({
      owner: props.githubOwner,
      repo: props.githubRepo,
    });

    const secretScanProject = new codebuild.Project(this, 'SecretScanProject', {
      projectName: 'vuln-web-app-secret-scan',
      source: repoSource,
      environment: { buildImage: codebuild.LinuxBuildImage.STANDARD_7_0 },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        '../../buildspecs/secrets.yaml'
      ),
    });

    const depScanProject = new codebuild.Project(this, 'DepScanProject', {
      projectName: 'vuln-web-app-dependency-scan',
      source: repoSource,
      environment: { buildImage: codebuild.LinuxBuildImage.STANDARD_7_0 },
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        '../../buildspecs/dependencies.yaml'
      ),
    });

    const semgrepScanProject = new codebuild.Project(
      this,
      'SemgrepScanProject',
      {
        projectName: 'vuln-web-app-semgrep-sast',
        source: repoSource,
        environment: { buildImage: codebuild.LinuxBuildImage.STANDARD_7_0 },
        buildSpec: codebuild.BuildSpec.fromSourceFilename(
          '../../buildspecs/semgrep.yaml'
        ),
      }
    );

    // E. Lambda Deploy Project (Executes CDK Deploy for TargetAppStack)
    const deployProject = new codebuild.Project(this, 'DeployProject', {
      projectName: 'vuln-web-app-lambda-deploy',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: 22 },
            commands: ['cd cdk && npm ci --loglevel=error'],
          },
          build: {
            commands: [
              'echo "[*] Deploying TargetAppStack to AWS Lambda..."',
              `npx cdk deploy TargetAppStack --app "npx tsx bin/target-app.ts" --require-approval never -c "webAclArn=${props.webAclArn}"`,
            ],
          },
        },
      }),
    });

    // Grant administrative permissions to deploy CloudFormation & Lambda
    deployProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['*'],
        resources: ['*'],
      })
    );

    // ------------------------------------------------------------------
    // 2. AWS CodePipeline Definition
    // ------------------------------------------------------------------
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    const pipeline = new codepipeline.Pipeline(this, 'SecurityPipeline', {
      pipelineName: 'vuln-web-app-security-pipeline',
      restartExecutionOnUpdate: true,
    });

    // --- STAGE 1: Source ---
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'CodeStar_GitHub_Source',
          owner: props.githubOwner,
          repo: props.githubRepo,
          branch: branch,
          connectionArn: props.githubConnectionArn,
          output: sourceOutput,
        }),
      ],
    });

    // --- STAGE 2: Parallel Build & Security Scans (runOrder: 1) ---
    pipeline.addStage({
      stageName: 'BuildAndParallelScan',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'PrimaryCdkBuild',
          project: cdkBuildProject,
          input: sourceOutput,
          outputs: [buildOutput],
          runOrder: 1,
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'SecretScan_Gitleaks',
          project: secretScanProject,
          input: sourceOutput,
          runOrder: 1,
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'DependencyScan_Audit',
          project: depScanProject,
          input: sourceOutput,
          runOrder: 1,
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'StaticAnalysis_Semgrep',
          project: semgrepScanProject,
          input: sourceOutput,
          runOrder: 1,
        }),
      ],
    });

    // --- STAGE 3: Deploy to AWS Lambda ---
    pipeline.addStage({
      stageName: 'DeployToLambda',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'CdkDeploy_TargetApp',
          project: deployProject,
          input: buildOutput,
          runOrder: 1,
        }),
      ],
    });
  }
}
