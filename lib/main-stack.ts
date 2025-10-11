import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { VpcConstruct } from "./constructs/vpc.js";
import { NatInstanceConstruct } from "./constructs/nat-instance.js";
import { RdsConstruct } from "./constructs/rds.js";
import { DbInitConstruct } from "./constructs/db-init.js";
import { ObservabilityConstruct } from "./constructs/observability.js";
import { EcsConstruct } from "./constructs/ecs.js";
import { EnvironmentConfig, EnvironmentName } from "./config/env-config.js";

interface MainStackProps extends cdk.StackProps {
  envName: EnvironmentName;
  config: EnvironmentConfig;
}

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    const { envName, config } = props;
    const baseName = `${config.service}-${envName}-${config.client}`;

    const availabilityZones =
      this.availabilityZones.length > 0
        ? this.availabilityZones
        : [`${this.region}a`, `${this.region}b`];

    // VPC
    const vpcMod = new VpcConstruct(this, "Vpc", {
      baseName,
      cidr: config.cidr,
      availabilityZones,
      natGatewayCount: config.nat.natGatewayCount,
      useNatInstance: config.nat.useNatInstance,
    });

    // NAT Instance (optional)
    new NatInstanceConstruct(this, "NatInstance", {
      vpc: vpcMod.vpc,
      baseName,
      enableNatInstance: config.nat.useNatInstance,
    });

    // RDS
    const rds = new RdsConstruct(this, "Rds", {
      vpc: vpcMod.vpc,
      baseName,
      multiAz: config.rds.multiAz,
      allocatedStorage: config.rds.allocatedStorage,
      enableReplica: config.rds.enableReplica,
    });

    // DB init
    new DbInitConstruct(this, "DbInit", {
      vpc: vpcMod.vpc,
      database: rds.db,
      baseName,
      region: this.region,
    });

    // Observability base
    const obs = new ObservabilityConstruct(this, "Obs", {
      baseName,
      alertEmail: config.observability?.alertEmail ?? "alerts@example.com",
    });

    const ecsDefaults = config.ecs ?? {};

    // ECS
    const ecs = new EcsConstruct(this, "Ecs", {
      vpc: vpcMod.vpc,
      baseName,
      cpu: ecsDefaults.cpu ?? 256,
      memoryMiB: ecsDefaults.memoryMiB ?? 512,
      desiredCount: ecsDefaults.desiredCount ?? 1,
      image: ecsDefaults.image ?? "public.ecr.aws/docker/library/nginx:latest", // replace with your Django image
      logGroup: obs.logGroup,
      database: rds.db
    });

    // ALB metrics/alarms
    new ObservabilityConstruct(this, "ObsAlb", {
      baseName: `${baseName}-alb`,
      alb: ecs.alb,
      alertEmail: config.observability?.alertEmail,
    });

    new cdk.CfnOutput(this, "AlbDnsName", { value: ecs.alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, "RdsEndpoint", { value: rds.db.dbInstanceEndpointAddress });
  }
}
