import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";

export interface NatInstanceConstructProps {
  vpc: ec2.IVpc;
  baseName: string;
  enableNatInstance?: boolean;
}

export class NatInstanceConstruct extends Construct {
  readonly instance?: ec2.Instance;

  constructor(scope: Construct, id: string, props: NatInstanceConstructProps) {
    super(scope, id);

    const { vpc, baseName, enableNatInstance = false } = props;
    if (!enableNatInstance) {
      new cdk.CfnOutput(this, "NatInstanceSkipped", { value: "NAT Instance disabled" });
      return;
    }

    const natAmi = ec2.MachineImage.lookup({
      name: "amzn-ami-vpc-nat-*-x86_64-ebs",
      owners: ["amazon"],
    });

    const sg = new ec2.SecurityGroup(this, `NatSg-${baseName}`, {
      vpc,
      allowAllOutbound: true,
      description: "NAT Instance Security Group",
    });
    // SSH only if needed; prefer SSM
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "SSH (debug only)");

    const role = new iam.Role(this, `NatRole-${baseName}`, {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });

    this.instance = new ec2.Instance(this, `NatInstance-${baseName}`, {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: natAmi,
      securityGroup: sg,
      role,
    });

    // Disable Source/Dest Check
    const cfn = this.instance.node.defaultChild as ec2.CfnInstance;
    cfn.sourceDestCheck = false;

    new cdk.CfnOutput(this, "NatInstancePublicIp", {
      value: this.instance.instancePublicIp,
      description: "Public IP of the NAT instance",
    });
  }
}
