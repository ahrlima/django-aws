import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as cdk from "aws-cdk-lib";

export interface RdsConstructProps {
  vpc: ec2.IVpc;
  baseName: string;
  multiAz: boolean;
  allocatedStorage: number;
  enableReplica?: boolean;
}

export class RdsConstruct extends Construct {
  readonly db: rds.DatabaseInstance;
  readonly replica?: rds.DatabaseInstanceReadReplica;

  constructor(scope: Construct, id: string, p: RdsConstructProps) {
    super(scope, id);

    this.db = new rds.DatabaseInstance(this, `Postgres-${p.baseName}`, {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.V16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: p.vpc,
      multiAz: p.multiAz,
      allocatedStorage: p.allocatedStorage,
      publiclyAccessible: false,
      iamAuthentication: true,
      credentials: rds.Credentials.fromGeneratedSecret("postgres"),
      databaseName: "appdb",
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    if (p.enableReplica) {
      this.replica = new rds.DatabaseInstanceReadReplica(this, `Replica-${p.baseName}`, {
        sourceDatabaseInstance: this.db,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
        vpc: p.vpc,
        deletionProtection: false,
      });
    }
  }
}
