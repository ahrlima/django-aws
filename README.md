# Django on ECS (AWS CDK TypeScript)

Production-style infrastructure (IaC) for a Django app on **Amazon ECS Fargate**, fronted by **ALB**, connected to **RDS PostgreSQL** with **IAM Authentication** (no static passwords), and instrumented with **CloudWatch + SNS**. Designed to be **Free Tier–friendly** while demonstrating production patterns.

## Highlights
- **VPC** with manually selected AZs, /26 public and /22 private subnets.
- **NAT Instance (t3.micro)** optional for dev/lab to avoid NAT Gateway cost.
- **ECS Fargate** service with ALB, health checks, and autoscaling.
- **RDS Postgres** with IAM Auth (no static credentials).
- **DbInit Lambda** creates DB roles and `app_user` via IAM Auth on deploy.
- **Observability**: logs, CPU/memory alarms, and ALB 5xx alarms to SNS.

## Prerequisites
- Node.js 18+ and npm installed locally.
- AWS CLI v2 configured with credentials for the target account/region.
- AWS CDK v2 available (`npm install -g aws-cdk` or rely on `npx cdk`).
- Docker installed if you plan to build/push container images or bundle Lambda code locally.

## Deploy (quick start)
```bash
npm install
cdk bootstrap
cdk deploy -c env=dev
```

> Replace the container image in `lib/constructs/ecs.ts` (or the matching entry in `config/environments.ts`) with the image you publish to ECR for your Django app.

## Configure environments
All environment-specific settings live in `config/environments.ts`. Duplicate the `dev` block or override the fields below to suit your deployment:
- `service` and `client` control the naming convention for AWS resources.
- `nat.useNatInstance` toggles the development NAT instance in place of NAT Gateways.
- `rds.enableReplica` provisions an optional read replica when set to `true`.
- `ecs.image` should reference the container image tag you want the ECS service to run.
- `observability.alertEmail` sets the destination for CloudWatch alarms.
- `remoteState.enabled` provisions the shared Terraform remote state bucket/table (see below). Optionally provide `bucketName` and `tableName` to override the auto-generated names.
  
Global defaults (naming, tagging, security toggles) are defined in `config/globals.ts`.

Pass `-c env=<name>` (or `-c environment=<name>`) to select which configuration block to deploy.

## Application image
Push your Django container to ECR (or another registry the account can reach) before deployment. Point `ecs.image` to that URI, or update the value directly in `lib/constructs/ecs.ts` if you prefer to hard-code it in the stack.

## Terraform remote state
For a small team (≈3 engineers), the stack can create a shared Terraform remote state backend backed by **Amazon S3** with **DynamoDB** locking. Enable it by keeping `remoteState.enabled = true` in `config/environments.ts` (default). On deployment the stack outputs:
- `RemoteStateBucketName` — versioned, SSE-enabled bucket (with `RETAIN` removal policy) to hold `.tfstate`.
- `RemoteStateLockTableName` — DynamoDB table (on-demand billing, `RETAIN`) used to coordinate state locks.

Example Terraform backend configuration:

```hcl
terraform {
  backend "s3" {
    bucket         = "<RemoteStateBucketName output>"
    key            = "terraform/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "<RemoteStateLockTableName output>"
    encrypt        = true
  }
}
```

Override `bucketName`/`tableName` in the environment config if you need predictable names (ensuring global uniqueness for buckets).

## Cost Awareness Summary
- **RDS t3.micro**: covered by Free Tier (up to 750 hours)
- **NAT Gateway**: **not** Free Tier; use **NAT Instance** for dev/lab
- **CloudWatch**: small usage typically within Free Tier
- **ECS Fargate**: Free Tier has a small monthly allowance; keep task size modest

## IAM Auth in Django
Your Django settings should generate a token at connection time:
```python
import boto3, os
def generate_token():
    rds = boto3.client('rds', region_name=os.getenv('AWS_REGION', 'us-east-1'))
    return rds.generate_db_auth_token(DBHostname=os.environ['DB_HOST'], Port=5432, DBUsername=os.environ['DB_USER'])
# DATABASES['default']['PASSWORD'] = generate_token()
```

## Optional Read Replica
Set `rds.enableReplica` to `true` in `config/environments.ts` (per environment) to deploy a read replica. It is disabled by default to stay within Free Tier.

## NAT Instance (dev only)
See **DEVELOPER_GUIDE.md** for the cost rationale, security posture (Session Manager enabled), and production guidance when switching back to managed NAT Gateways.
