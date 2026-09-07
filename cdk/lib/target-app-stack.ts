import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { aws_apigatewayv2 as apigatewayv2 } from 'aws-cdk-lib';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { aws_cloudfront as cloudfront } from 'aws-cdk-lib';
import { aws_cloudfront_origins as origins } from 'aws-cdk-lib';
import { aws_lambda_nodejs as lambdaNodejs } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface TargetAppStackProps extends cdk.StackProps {
  readonly webAclArn: string;
}

export class TargetAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TargetAppStackProps) {
    super(scope, id, props);

    const webAclArn = props.webAclArn;

    const targetFunction = new lambdaNodejs.NodejsFunction(
      this,
      'TargetFunction',
      {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        entry: path.join(__dirname, '../../src/lambda.js'),
        handler: 'handler',
        projectRoot: path.join(__dirname, '../..'),
        timeout: cdk.Duration.seconds(15),
        memorySize: 512,
        bundling: {
          minify: false,
          sourceMap: true,
          format: lambdaNodejs.OutputFormat.CJS,
          target: 'node22',
        },
      }
    );

    const integration = new HttpLambdaIntegration(
      'TargetLambdaIntegration',
      targetFunction
    );

    const httpApi = new apigatewayv2.HttpApi(this, 'TargetHttpApi', {
      defaultIntegration: integration,
    });

    const apiDomain = cdk.Fn.select(2, cdk.Fn.split('/', httpApi.apiEndpoint));

    const distribution = new cloudfront.Distribution(
      this,
      'TargetDistribution',
      {
        webAclId: props.webAclArn,
        defaultBehavior: {
          origin: new origins.HttpOrigin(apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      }
    );

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: httpApi.apiEndpoint,
    });
  }
}
