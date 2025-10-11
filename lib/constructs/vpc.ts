import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface VpcConstructProps {
  baseName: string;
  cidr: string;
  availabilityZones: string[];
  publicSubnetsPerAz?: number;
  privateSubnetsPerAz?: number;
  natGatewayCount?: number; // min 1 if not using NAT instance
  useNatInstance?: boolean; // when true, we set natGatewayCount=0 and attach a NAT instance
}

export class VpcConstruct extends Construct {
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    const {
      baseName,
      cidr,
      availabilityZones,
      publicSubnetsPerAz = 1,
      privateSubnetsPerAz = 1,
      natGatewayCount = 1,
      useNatInstance = false,
    } = props;

    const subnetConfiguration: ec2.SubnetConfiguration[] = [
      {
        name: `${baseName}-public`,
        subnetType: ec2.SubnetType.PUBLIC,
        cidrMask: 26,
      },
      {
        name: `${baseName}-private`,
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        cidrMask: 22,
      },
    ];

    this.vpc = new ec2.Vpc(this, `Vpc-${baseName}`, {
      vpcName: baseName,
      ipAddresses: ec2.IpAddresses.cidr(cidr),
      availabilityZones,
      maxAzs: availabilityZones.length,
      natGateways: useNatInstance ? 0 : Math.max(1, natGatewayCount),
      subnetConfiguration,
    });
  }
}
