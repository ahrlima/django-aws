import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";
import * as path from "path";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";

export interface DbInitProps {
  vpc: ec2.IVpc;
  database: rds.DatabaseInstance;
  baseName: string;
  region: string;
}

export class DbInitConstruct extends Construct {
  constructor(scope: Construct, id: string, p: DbInitProps) {
    super(scope, id);

    const fn = new PythonFunction(this, `DbInitFn-${p.baseName}`, {
      entry: path.join(__dirname, "../../lambda/db_init"),
      runtime: lambda.Runtime.PYTHON_3_12,
      index: "index.py",
      handler: "handler",
      vpc: p.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        AWS_REGION: p.region,
        DB_HOST: p.database.dbInstanceEndpointAddress,
        DB_USER: "postgres",
        DB_NAME: "appdb",
      },
      timeout: lambda.Duration.minutes(2),
    });

    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["rds-db:connect", "rds:DescribeDBInstances", "rds:GenerateDbAuthToken"],
      resources: ["*"],
    }));

    p.database.connections.allowFrom(fn, ec2.Port.tcp(5432));

    new cr.AwsCustomResource(this, `DbInitTrigger-${p.baseName}`, {
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({ actions: ["lambda:InvokeFunction"], resources: [fn.functionArn] })
      ]),
      onCreate: { service: "Lambda", action: "invoke", parameters: { FunctionName: fn.functionName }, physicalResourceId: cr.PhysicalResourceId.of(`DbInit-${p.baseName}`) },
      onUpdate: { service: "Lambda", action: "invoke", parameters: { FunctionName: fn.functionName } },
    });
  }
}
