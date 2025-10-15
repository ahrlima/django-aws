import * as cdk from "aws-cdk-lib";
import type { EnvironmentName, EnvironmentSettings } from "../config/environments";
import type { GlobalsConfig } from "../config/globals";
import { applyGlobalTags } from "../config/globals";
import { VpcConstruct } from "../constructs/vpc";
import { NatInstanceConstruct } from "../constructs/nat-instance";
import type { Construct } from "constructs";
import type * as ec2 from "aws-cdk-lib/aws-ec2";

export interface NetworkStackProps extends cdk.StackProps {
  envName: EnvironmentName;
  config: EnvironmentSettings;
  globals: GlobalsConfig;
  nameFor: (resource: string) => string;
}

export class NetworkStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { envName, config, globals, nameFor } = props;

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

    const vpcConstruct = new VpcConstruct(this, "Vpc", {
      namer: nameFor,
      cidr: config.vpc.cidr,
      availabilityZones,
      natGatewayCount: config.vpc.natGatewayCount,
      useNatInstance: config.vpc.useNatInstance,
    });

    this.vpc = vpcConstruct.vpc;

    new NatInstanceConstruct(this, "NatInstance", {
      vpc: this.vpc,
      namer: nameFor,
      enableNatInstance: config.vpc.useNatInstance,
      instanceType: config.natInstance?.instanceType ?? "t3.micro",
      allowedSshCidrs: config.natInstance?.allowSshFrom ?? [],
    });
  }
}
