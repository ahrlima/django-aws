import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface VpcConstructProps {
  namer: (resource: string) => string;
  cidr: string;
  availabilityZones: string[];
  natGatewayCount: number;
  useNatInstance: boolean;
}

/**
 * Builds the shared VPC topology with opinionated subnet sizing while honouring
 * the global naming convention for every network component.
 */
export class VpcConstruct extends Construct {
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    const subnetConfiguration: ec2.SubnetConfiguration[] = [
      {
        name: props.namer("subnet-public"),
        subnetType: ec2.SubnetType.PUBLIC,
        cidrMask: 26,
      },
      {
        name: props.namer("subnet-private"),
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        cidrMask: 22,
      },
    ];

    this.vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: props.namer("vpc"),
      ipAddresses: ec2.IpAddresses.cidr(props.cidr),
      availabilityZones: props.availabilityZones,
      natGateways: props.useNatInstance ? 0 : Math.max(1, props.natGatewayCount),
      subnetConfiguration,
    });
  }
}
