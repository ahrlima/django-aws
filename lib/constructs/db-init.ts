import { Construct } from "constructs";
import * as path from "path";
import { Duration } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";

export interface DbInitProps {
  vpc: ec2.IVpc;
  database: rds.DatabaseInstance;
  namer: (resource: string) => string;
  region: string;
  databaseName: string;
  adminUser: string;
  appUser: string;
  secret: secretsmanager.ISecret;
}

/**
 * Runs a one-time Lambda-backed custom resource to initialise database roles
 * and the application user using IAM authentication.
 */
export class DbInitConstruct extends Construct {
  constructor(scope: Construct, id: string, props: DbInitProps) {
    super(scope, id);

    const fn = new PythonFunction(this, "DbInitFunction", {
      functionName: props.namer("lambda-dbinit"),
      entry: path.join(__dirname, "../../lambda/db_init"),
      runtime: lambda.Runtime.PYTHON_3_12,
      index: "index.py",
      handler: "handler",
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        DB_HOST: props.database.dbInstanceEndpointAddress,
        DB_USER: props.adminUser,
        DB_NAME: props.databaseName,
        APP_USER: props.appUser,
        DB_SECRET_ARN: props.secret.secretArn,
      },
      timeout: Duration.seconds(30),
    });

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["rds-db:connect", "rds:DescribeDBInstances", "rds:GenerateDbAuthToken"],
        resources: ["*"],
      }),
    );

    props.secret.grantRead(fn);

    props.database.connections.allowFrom(
      fn,
      ec2.Port.tcp(5432),
      "Allow DB init Lambda to reach PostgreSQL",
    );

    new cr.AwsCustomResource(this, "DbInitTrigger", {
      resourceType: "Custom::DjangoDbInit",
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["lambda:InvokeFunction"],
          resources: [fn.functionArn],
        }),
      ]),
      onCreate: {
        service: "Lambda",
        action: "invoke",
        parameters: { FunctionName: fn.functionName },
        physicalResourceId: cr.PhysicalResourceId.of(props.namer("dbinit")),
      },
      onUpdate: {
        service: "Lambda",
        action: "invoke",
        parameters: { FunctionName: fn.functionName },
      },
    });
  }
}
