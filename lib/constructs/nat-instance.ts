import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";

export interface NatInstanceConstructProps {
  vpc: ec2.IVpc;
  namer: (resource: string) => string;
  enableNatInstance: boolean;
  instanceType: string;
  allowedSshCidrs: string[];
}

/**
 * Optionally provisions a cost-effective NAT Instance for development
 * environments, configured for Session Manager access and global naming.
 */
export class NatInstanceConstruct extends Construct {
  readonly instance?: ec2.Instance;

  constructor(scope: Construct, id: string, props: NatInstanceConstructProps) {
    super(scope, id);

    if (!props.enableNatInstance) {
      new cdk.CfnOutput(this, "NatInstanceSkipped", { value: "NAT instance disabled" });
      return;
    }

    const natAmi = ec2.MachineImage.lookup({
      name: "amzn-ami-vpc-nat-*-x86_64-ebs",
      owners: ["amazon"],
    });

    const securityGroup = new ec2.SecurityGroup(this, "NatSecurityGroup", {
      vpc: props.vpc,
      securityGroupName: props.namer("sg-nat"),
      allowAllOutbound: true,
      description: "Security group for NAT instance (prefer SSM over SSH).",
    });

    for (const cidr of props.allowedSshCidrs) {
      securityGroup.addIngressRule(
        ec2.Peer.ipv4(cidr),
        ec2.Port.tcp(22),
        "Temporary SSH access",
      );
    }

    const instanceRole = new iam.Role(this, "NatInstanceRole", {
      roleName: props.namer("role-nat"),
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });

    this.instance = new ec2.Instance(this, "NatInstance", {
      instanceName: props.namer("nat"),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(props.instanceType),
      machineImage: natAmi,
      securityGroup,
      role: instanceRole,
    });

    const cfnInstance = this.instance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.sourceDestCheck = false;

    new cdk.CfnOutput(this, "NatInstancePublicIp", {
      value: this.instance.instancePublicIp,
      description: "Public IP of the NAT instance",
    });
  }
}
