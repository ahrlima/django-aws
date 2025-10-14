import * as cdk from "aws-cdk-lib";
import * as guardduty from "aws-cdk-lib/aws-guardduty";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";
import { naming, applyGlobalTags } from "../config/globals";
import type { GlobalsConfig } from "../config/globals";
import type { EnvironmentName, EnvironmentSettings } from "../config/environments";
import { VpcConstruct } from "./constructs/vpc";
import { NatInstanceConstruct } from "./constructs/nat-instance";
import { RdsConstruct } from "./constructs/rds";
import { DbInitConstruct } from "./constructs/db-init";
import { ObservabilityConstruct } from "./constructs/observability";
import { EcsConstruct } from "./constructs/ecs";
import { RemoteStateConstruct } from "./constructs/remote-state";

interface MainStackProps extends cdk.StackProps {
  envName: EnvironmentName;
  config: EnvironmentSettings;
  globals: GlobalsConfig;
}

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    const { envName, config, globals } = props;

    const nameFor = (resource: string) =>
      naming({
        env: envName,
        service: config.service,
        resource,
        client: config.client,
      });

    applyGlobalTags(this, envName, {
      confidentiality: config.confidentiality ?? globals.tags.confidentiality,
      ...config.tagOverrides,
    });

    const availabilityZones =
      config.vpc.availabilityZones && config.vpc.availabilityZones.length > 0
        ? config.vpc.availabilityZones
        : this.availabilityZones.length > 0
          ? this.availabilityZones
          : [`${this.region}a`, `${this.region}b`];

    const vpc = new VpcConstruct(this, "Vpc", {
      namer: nameFor,
      cidr: config.vpc.cidr,
      availabilityZones,
      natGatewayCount: config.vpc.natGatewayCount,
      useNatInstance: config.vpc.useNatInstance,
    });

    new NatInstanceConstruct(this, "NatInstance", {
      vpc: vpc.vpc,
      namer: nameFor,
      enableNatInstance: config.vpc.useNatInstance,
      instanceType: config.natInstance?.instanceType ?? "t3.micro",
      allowedSshCidrs: config.natInstance?.allowSshFrom ?? [],
    });

    const database = new RdsConstruct(this, "Rds", {
      vpc: vpc.vpc,
      namer: nameFor,
      security: globals.security,
      multiAz: config.rds.multiAz,
      allocatedStorage: config.rds.allocatedStorage,
      instanceType: config.rds.instanceType,
      databaseName: config.rds.databaseName,
      adminUser: config.rds.adminUser,
      appUser: config.rds.appUser,
      backupRetentionDays: config.rds.backupRetentionDays,
      deletionProtection: config.rds.deletionProtection,
      enableReplica: config.rds.enableReplica,
    });

    new DbInitConstruct(this, "DbInit", {
      vpc: vpc.vpc,
      namer: nameFor,
      database: database.db,
      region: config.region,
      databaseName: config.rds.databaseName,
      adminUser: config.rds.adminUser,
      appUser: config.rds.appUser,
    });

    const observability = new ObservabilityConstruct(this, "Observability", {
      namer: nameFor,
      logGroupPrefix: globals.security.logGroupPrefix,
      logRetentionDays: config.observability.logRetentionDays,
      logKmsAlias: globals.security.kmsAliases?.logs,
      alertEmail: config.observability.alertEmail,
    });

    const ecs = new EcsConstruct(this, "Ecs", {
      vpc: vpc.vpc,
      namer: nameFor,
      cpu: config.ecs.cpu,
      memoryMiB: config.ecs.memoryMiB,
      desiredCount: config.ecs.desiredCount,
      image: config.ecs.image,
      containerPort: config.ecs.containerPort,
      assignPublicIp: config.ecs.assignPublicIp,
      minCapacity: config.ecs.minCapacity,
      maxCapacity: config.ecs.maxCapacity,
      scalingTargetUtilization: config.ecs.scalingTargetUtilization,
      certificateArn: config.ecs.certificateArn,
      security: globals.security,
      logGroup: observability.logGroup,
      database: database.db,
      databaseName: config.rds.databaseName,
      databaseUser: config.rds.appUser,
      region: config.region,
      environmentName: envName,
    });

    observability.configureServiceAlarms(ecs.service);
    observability.configureAlbAlarms(ecs.alb);

    if (config.remoteState?.enabled) {
      new RemoteStateConstruct(this, "RemoteState", {
        namer: nameFor,
        bucketName: config.remoteState.bucketName,
        tableName: config.remoteState.tableName,
      });
    }

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
    new cdk.CfnOutput(this, "RdsEndpoint", { value: database.db.dbInstanceEndpointAddress });
  }
}
