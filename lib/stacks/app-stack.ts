import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as guardduty from "aws-cdk-lib/aws-guardduty";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as rds from "aws-cdk-lib/aws-rds";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { EnvironmentName, EnvironmentSettings } from "../../config/environments";
import type { GlobalsConfig } from "../../config/globals";
import { applyGlobalTags } from "../../config/globals";
import { ObservabilityConstruct } from "../constructs/observability";
import { EcsConstruct } from "../constructs/ecs";

export interface AppStackProps extends cdk.StackProps {
  envName: EnvironmentName;
  config: EnvironmentSettings;
  globals: GlobalsConfig;
  nameFor: (resource: string) => string;
  vpc: ec2.IVpc;
  database: rds.DatabaseInstance;
  databaseSecret: secretsmanager.ISecret;
  defaultImageTag: string;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { envName, config, globals, nameFor, vpc, database, databaseSecret, defaultImageTag } = props;

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

    let containerImage: ecs.ContainerImage;
    let repository: ecr.IRepository | undefined;
    const outputs: { key: string; value: string }[] = [];

    if (config.ecs.buildOnDeploy) {
      const appImageAsset = new ecrAssets.DockerImageAsset(this, "AppImage", {
        directory: path.join(__dirname, "../../app"),
      });
      containerImage = ecs.ContainerImage.fromDockerImageAsset(appImageAsset);
      outputs.push({ key: "DevImageAssetUri", value: appImageAsset.imageUri });
    } else {
      if (!config.ecs.repositoryName) {
        throw new Error("ecs.repositoryName must be defined when buildOnDeploy=false.");
      }

      const repoId = "AppRepository";
      repository = config.ecs.manageRepository
        ? new ecr.Repository(this, repoId, {
            repositoryName: config.ecs.repositoryName,
            imageScanOnPush: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            lifecycleRules: [{ maxImageCount: 10 }],
          })
        : ecr.Repository.fromRepositoryName(this, repoId, config.ecs.repositoryName);

      const imageTag = this.node.tryGetContext("imageTag") ?? defaultImageTag;
      containerImage = ecs.ContainerImage.fromEcrRepository(repository, imageTag);

      const repositoryUri =
        config.ecs.manageRepository && repository instanceof ecr.Repository
          ? repository.repositoryUri
          : `${cdk.Stack.of(this).account}.dkr.ecr.${cdk.Stack.of(this).region}.amazonaws.com/${config.ecs.repositoryName}`;

      outputs.push({ key: "EcrRepositoryUri", value: repositoryUri });
      outputs.push({ key: "AppImageTag", value: imageTag });
    }

    const ecsConstruct = new EcsConstruct(this, "Ecs", {
      vpc,
      namer: nameFor,
      cpu: config.ecs.cpu,
      memoryMiB: config.ecs.memoryMiB,
      desiredCount: config.ecs.desiredCount,
      containerImage,
      repository,
      containerPort: config.ecs.containerPort,
      assignPublicIp: config.ecs.assignPublicIp,
      minCapacity: config.ecs.minCapacity,
      maxCapacity: config.ecs.maxCapacity,
      scalingTargetUtilization: config.ecs.scalingTargetUtilization,
      certificateArn: config.ecs.certificateArn,
      security: globals.security,
      logGroup: observability.logGroup,
      database,
      databaseSecret,
      databaseSecurityGroupIds: database.connections.securityGroups.map((sg) => sg.securityGroupId),
      databaseName: config.rds.databaseName,
      databaseUser: config.rds.appUser,
      region: config.region,
      environmentName: envName,
    });

    observability.configureServiceAlarms(ecsConstruct.service);
    observability.configureAlbAlarms(ecsConstruct.alb);

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
        resourceArn: ecsConstruct.alb.loadBalancerArn,
        webAclArn: webAcl.attrArn,
      });
    }

    new cdk.CfnOutput(this, "AlbDnsName", { value: ecsConstruct.alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, "RdsEndpoint", { value: database.dbInstanceEndpointAddress });
    for (const output of outputs) {
      new cdk.CfnOutput(this, output.key, { value: output.value });
    }
  }
}
