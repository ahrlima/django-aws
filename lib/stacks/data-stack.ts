import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { EnvironmentName, EnvironmentSettings } from "../config/environments";
import type { GlobalsConfig } from "../config/globals";
import { applyGlobalTags } from "../config/globals";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as rds from "aws-cdk-lib/aws-rds";
import { RdsConstruct } from "../constructs/rds";
import { DbInitConstruct } from "../constructs/db-init";

export interface DataStackProps extends cdk.StackProps {
  envName: EnvironmentName;
  config: EnvironmentSettings;
  globals: GlobalsConfig;
  nameFor: (resource: string) => string;
  vpc: ec2.IVpc;
}

export class DataStack extends cdk.Stack {
  readonly database: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { envName, config, globals, nameFor, vpc } = props;

    applyGlobalTags(this, envName, {
      confidentiality: config.confidentiality ?? globals.tags.confidentiality,
      ...config.tagOverrides,
    });

    const databaseConstruct = new RdsConstruct(this, "Rds", {
      vpc,
      namer: nameFor,
      security: globals.security,
      multiAz: config.rds.multiAz,
      allocatedStorage: config.rds.allocatedStorage,
      instanceType: config.rds.instanceType,
      databaseName: config.rds.databaseName,
      adminUser: config.rds.adminUser,
      appUser: config.rds.appUser,
      backupRetentionDays: config.rds.backupRetentionDays,
      enableReplica: config.rds.enableReplica,
    });

    this.database = databaseConstruct.db;

    new DbInitConstruct(this, "DbInit", {
      vpc,
      namer: nameFor,
      database: this.database,
      region: config.region,
      databaseName: config.rds.databaseName,
      adminUser: config.rds.adminUser,
      appUser: config.rds.appUser,
    });
  }
}
