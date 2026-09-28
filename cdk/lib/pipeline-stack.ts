import * as cdk from 'aws-cdk-lib';
import {
  aws_codebuild as codebuild,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as codepipeline_actions,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  readonly githubRepo: string;
  readonly githubOwner: string;
  readonly githubBranch?: string;
  readonly connectionArn?: string;
  readonly githubConnectionArn?: string;
  readonly targetAppUrl?: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const branch = props.githubBranch || 'main';
    const connectionArn = props.connectionArn || props.githubConnectionArn;
    if (!connectionArn) {
      throw new Error('connectionArn or githubConnectionArn must be provided');
    }

    // 1. Pipeline Artifacts
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const synthOutput = new codepipeline.Artifact('SynthOutput');
    const zapOutput = new codepipeline.Artifact('ZapOutput');

    // 2. Helper to create standard CodeBuild scanning/build projects
    const createCodeBuildProject = (
      name: string,
      buildSpecPath: string,
      privileged = false,
      envVars?: { [key: string]: codebuild.BuildEnvironmentVariable }
    ) => {
      return new codebuild.PipelineProject(this, name, {
        projectName: `${this.stackName}-${name}`,
        buildSpec: codebuild.BuildSpec.fromSourceFilename(buildSpecPath),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          privileged,
          environmentVariables: envVars,
        },
      });
    };

    // Pre-build security scanner projects
    const secretsProject = createCodeBuildProject('PreBuild-Gitleaks', 'buildspecs/prebuild-secrets.yml');
    const sastProject = createCodeBuildProject('PreBuild-Semgrep', 'buildspecs/prebuild-sast.yml');
    const scaProject = createCodeBuildProject('PreBuild-Trivy', 'buildspecs/prebuild-sca.yml');

    // Build & Synth project
    const buildProject = createCodeBuildProject('Build-Synth-Checkov', 'buildspecs/build-synth.yml');

    // Deploy project (runs CDK deploy with required CloudFormation / IAM permissions)
    const deployProject = new codebuild.PipelineProject(this, 'DeployProject', {
      projectName: `${this.stackName}-CDK-Deploy`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 22,
            },
            commands: [
              'cd cdk',
              'npm ci',
            ],
          },
          build: {
            commands: [
              'npx cdk deploy TargetAppStack --require-approval never',
            ],
          },
        },
      }),
    });

    // Grant deployProject CDK deployment permissions
    deployProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      })
    );

    // Post-Deploy DAST project (OWASP ZAP requires privileged Docker)
    const dastProject = createCodeBuildProject(
      'PostDeploy-DAST-ZAP',
      'buildspecs/dast-zap.yml',
      true,
      {
        TARGET_URL: {
          value: props.targetAppUrl || '',
        },
      }
    );

    // 3. Assemble CodePipeline
    new codepipeline.Pipeline(this, 'DevSecOpsPipeline', {
      pipelineName: 'vuln-web-app-devsecops-pipeline',
      stages: [
        // STAGE 1: SOURCE - Triggers automatically on push to main
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeStarConnectionsSourceAction({
              actionName: 'GitHub_Source',
              owner: props.githubOwner,
              repo: props.githubRepo,
              branch,
              connectionArn,
              output: sourceOutput,
              triggerOnPush: true,
            }),
          ],
        },

        // STAGE 2: PRE-BUILD SECURITY CHECKS - Executed concurrently in PARALLEL via runOrder: 1
        {
          stageName: 'Security_PreBuild',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Gitleaks_Secrets',
              project: secretsProject,
              input: sourceOutput,
              runOrder: 1,
            }),
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Semgrep_SAST',
              project: sastProject,
              input: sourceOutput,
              runOrder: 1,
            }),
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Trivy_SCA',
              project: scaProject,
              input: sourceOutput,
              runOrder: 1,
            }),
          ],
        },

        // STAGE 3: BUILD, SYNTH & IAC SCAN
        {
          stageName: 'Build_And_IaC',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Synth_And_Checkov',
              project: buildProject,
              input: sourceOutput,
              outputs: [synthOutput],
              runOrder: 1,
            }),
          ],
        },

        // STAGE 4: DEPLOY
        {
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'CDK_Deploy',
              project: deployProject,
              input: sourceOutput,
              runOrder: 1,
            }),
          ],
        },

        // STAGE 5: POST-DEPLOY DAST (OWASP ZAP)
        {
          stageName: 'Security_PostDeploy_DAST',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'OWASP_ZAP_Scan',
              project: dastProject,
              input: sourceOutput,
              outputs: [zapOutput],
              runOrder: 1,
            }),
          ],
        },
      ],
    });
  }
}
