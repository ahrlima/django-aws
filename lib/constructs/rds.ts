import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import type { SecurityDefaults } from "../../config/globals";

export interface RdsConstructProps {
  vpc: ec2.IVpc;
  namer: (resource: string) => string;
  security: SecurityDefaults;
  instanceType: string;
  multiAz: boolean;
  allocatedStorage: number;
  databaseName: string;
  adminUser: string;
  appUser: string;
  backupRetentionDays: number;
  deletionProtection: boolean;
  enableReplica: boolean;
}

/**
 * Provisions the primary PostgreSQL instance (and optional replica) with IAM
 * authentication, encryption at rest, and globally consistent identifiers.
 */
export class RdsConstruct extends Construct {
  readonly db: rds.DatabaseInstance;
  readonly replica?: rds.DatabaseInstanceReadReplica;

  constructor(scope: Construct, id: string, props: RdsConstructProps) {
    super(scope, id);

    const kmsKey = props.security.kmsAliases?.rds
      ? kms.Alias.fromAliasName(this, "RdsKmsAlias", props.security.kmsAliases.rds)
      : undefined;

    this.db = new rds.DatabaseInstance(this, "Postgres", {
      instanceIdentifier: props.namer("rds"),
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: new ec2.InstanceType(props.instanceType),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      multiAz: props.multiAz,
      allocatedStorage: props.allocatedStorage,
      publiclyAccessible: false,
      iamAuthentication: true,
      credentials: rds.Credentials.fromGeneratedSecret(props.adminUser),
      databaseName: props.databaseName,
      backupRetention: cdk.Duration.days(props.backupRetentionDays),
      deletionProtection: props.deletionProtection,
      removalPolicy: props.deletionProtection
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      storageEncrypted: props.security.enforceEncryptionAtRest,
      storageEncryptionKey: kmsKey,
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
    });

    if (props.enableReplica) {
      this.replica = new rds.DatabaseInstanceReadReplica(this, "PostgresReplica", {
        instanceIdentifier: props.namer("rds-replica"),
        sourceDatabaseInstance: this.db,
        instanceType: new ec2.InstanceType(props.instanceType),
        vpc: props.vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        deletionProtection: props.deletionProtection,
        publiclyAccessible: false,
      });
    }
  }
}
