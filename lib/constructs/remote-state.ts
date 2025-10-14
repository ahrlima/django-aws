import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

interface RemoteStateProps {
  namer: (resource: string) => string;
  bucketName?: string;
  tableName?: string;
}

/**
 * Provides Terraform remote-state primitives (S3 + DynamoDB) that follow the
 * standard naming scheme and enforce encryption and TLS-only access.
 */
export class RemoteStateConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: RemoteStateProps) {
    super(scope, id);

    const bucketName = props.bucketName ?? props.namer("tfstate");
    const tableName = props.tableName ?? props.namer("tfstate-locks");

    this.bucket = new s3.Bucket(this, "StateBucket", {
      bucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    this.table = new dynamodb.Table(this, "LockTable", {
      tableName,
      partitionKey: { name: "LockID", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, "RemoteStateBucketName", {
      value: this.bucket.bucketName,
      description: "S3 bucket storing Terraform remote state files.",
    });

    new cdk.CfnOutput(this, "RemoteStateLockTableName", {
      value: this.table.tableName,
      description: "DynamoDB table used for Terraform state locking.",
    });
  }
}
