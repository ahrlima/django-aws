import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as guardduty from "aws-cdk-lib/aws-guardduty";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as rds from "aws-cdk-lib/aws-rds";
import type { Construct } from "constructs";
import type { EnvironmentName, EnvironmentSettings } from "../config/environments";
import type { GlobalsConfig } from "../config/globals";
import { applyGlobalTags } from "../config/globals";
import { ObservabilityConstruct } from "../constructs/observability";
import { EcsConstruct } from "../constructs/ecs";

export interface AppStackProps extends cdk.StackProps {
  envName: EnvironmentName;
  config: EnvironmentSettings;
  globals: GlobalsConfig;
  nameFor: (resource: string) => string;
  vpc: ec2.IVpc;
  database: rds.DatabaseInstance;
  defaultImageTag: string;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { envName, config, globals, nameFor, vpc, database, defaultImageTag } = props;

    applyGlobalTags(this, envName, {
      confidentiality: config.confidentiality ?? globals.tags.confidentiality,
      ...config.tagOverrides,
    });

    const observability = new ObservabilityConstruct(this, "Observability", {
      namer: nameFor,
      logGroupPrefix: globals.security.logGroupPrefix,
      logRetentionDays: config.observability.logRetentionDays,
      logKmsAlias: globals.security.kmsAliases?.logs,
      alertEmail: config.observability.alertEmail,
    });

    const repository = new ecr.Repository(this, "AppRepository", {
      repositoryName: nameFor("app"),
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    const imageTag = this.node.tryGetContext("imageTag") ?? defaultImageTag;

    const ecs = new EcsConstruct(this, "Ecs", {
      vpc,
      namer: nameFor,
      cpu: config.ecs.cpu,
      memoryMiB: config.ecs.memoryMiB,
      desiredCount: config.ecs.desiredCount,
      repository,
      imageTag,
      containerPort: config.ecs.containerPort,
      assignPublicIp: config.ecs.assignPublicIp,
      minCapacity: config.ecs.minCapacity,
      maxCapacity: config.ecs.maxCapacity,
      scalingTargetUtilization: config.ecs.scalingTargetUtilization,
      certificateArn: config.ecs.certificateArn,
      security: globals.security,
      logGroup: observability.logGroup,
      database,
      databaseName: config.rds.databaseName,
      databaseUser: config.rds.appUser,
      region: config.region,
      environmentName: envName,
    });

    observability.configureServiceAlarms(ecs.service);
    observability.configureAlbAlarms(ecs.alb);

    if (globals.security.enableGuardDuty) {
      new guardduty.CfnDetector(this, "GuardDutyDetector", { enable: true });
    }

    if (globals.security.enableWaf) {
      const webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
        defaultAction: { allow: {} },
        scope: "REGIONAL",
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: nameFor("waf"),
          sampledRequestsEnabled: true,
        },
        name: nameFor("acl"),
      });

      new wafv2.CfnWebACLAssociation(this, "WebAclAssociation", {
        resourceArn: ecs.alb.loadBalancerArn,
        webAclArn: webAcl.attrArn,
      });
    }

    new cdk.CfnOutput(this, "AlbDnsName", { value: ecs.alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, "RdsEndpoint", { value: database.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, "EcrRepositoryUri", { value: repository.repositoryUri });
  }
}
