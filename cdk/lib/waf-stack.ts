import * as cdk from 'aws-cdk-lib';
import { aws_wafv2 as wafv2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';

export class WafStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      env: { region: 'us-east-1' }, // CloudFront-scoped WAF must be in us-east-1
    });

    const webAcl = new wafv2.CfnWebACL(this, 'CloudFrontWebACL', {
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'TargetAppWebACLMetrics',
        sampledRequestsEnabled: true,
      },
      rules: [
        // 1. Custom Geo Restriction
        {
          name: 'GeoRestrictionRule',
          priority: 10,
          action: { block: {} }, // ◄ Switched from count to block
          statement: {
            geoMatchStatement: { countryCodes: ['CN', 'RU', 'KP'] },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'GeoRestrictionRuleMetric',
            sampledRequestsEnabled: true,
          },
        },
        // 2. Custom Rate Limit
        {
          name: 'RateLimitRule',
          priority: 20,
          action: { block: {} }, // ◄ Switched from count to block
          statement: {
            rateBasedStatement: { limit: 100, aggregateKeyType: 'IP' },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRuleMetric',
            sampledRequestsEnabled: true,
          },
        },
        // 3. Managed Rule Group - Core Rule Set
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 30,
          overrideAction: { none: {} }, // ◄ Switched to none (Enforces default BLOCK actions)
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSCommonRuleSetMetric',
            sampledRequestsEnabled: true,
          },
        },
        // 4. Managed Rule Group - Known Bad Inputs
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 40,
          overrideAction: { none: {} }, // ◄ Switched to none
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSKnownBadInputsMetric',
            sampledRequestsEnabled: true,
          },
        },
        // 5. Managed Rule Group - SQL Injection
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 50,
          overrideAction: { none: {} }, // ◄ Switched to none
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSSQLiRuleSetMetric',
            sampledRequestsEnabled: true,
          },
        },
        // 6. Managed Rule Group - Amazon IP Reputation
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 60,
          overrideAction: { none: {} }, // ◄ Switched to none
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSIPReputationMetric',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });
    const wafLogGroup = new logs.LogGroup(this, 'WafLogGroup', {
      logGroupName: 'aws-waf-logs-target-app',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 3. Attach Logging Configuration to Web ACL
    new wafv2.CfnLoggingConfiguration(this, 'WafLogging', {
      resourceArn: webAcl.attrArn,
      logDestinationConfigs: [wafLogGroup.logGroupArn],
    });

    this.webAclArn = webAcl.attrArn;
  }
}
