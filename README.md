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
cdk bootstrap --region us-east-1
cdk deploy --region us-east-1 -c env=dev NetworkStack-dev DataStack-dev AppStack-dev
```

> The `AppStack` builds and publishes the Docker image from `app/` automatically during `cdk deploy`; no manual ECR push or `-c imageTag` override is required.

> Because the app now synthesizes three stacks (`NetworkStack`, `DataStack`, and `AppStack`), the CDK CLI needs the explicit stack names (or `--all`) when you deploy.

## Configure environments
All environment-specific settings live in `config/environments.ts`. Duplicate the `dev` block or override the fields below to suit your deployment:
- `service` and `client` control the naming convention for AWS resources.
- `nat.useNatInstance` toggles the development NAT instance in place of NAT Gateways.
- `rds.enableReplica` provisions an optional read replica when set to `true`.
- The primary RDS instance is provisioned with deletion protection and a `RETAIN` removal policy so the database survives stack rollbacks or accidental deletes, and the DbInit Lambda now reads the master credentials from Secrets Manager instead of relying on IAM tokens.
- `observability.alertEmail` sets the destination for CloudWatch alarms.

Global defaults (naming, tagging, security toggles) are defined in `config/globals.ts`.

Pass `-c env=<name>` (or `-c environment=<name>`) to select which configuration block to deploy.

## Application image
During deployment the CDK builds the Docker image located in `app/` and pushes it to ECR as a Docker asset. The outputs `EcrRepositoryUri` and `AppImageUri` expose the generated image location (URI includes the digest).

Example manual flow:

```bash
# Build & test locally (optional but recommended)
docker build -t myapp-under-test ./app
docker run --rm -e DJANGO_SETTINGS_MODULE=testapp.settings myapp-under-test python manage.py test

# Deploy (image will be rebuilt and published automatically)
cdk deploy --region us-east-1 -c env=dev NetworkStack-dev DataStack-dev AppStack-dev

# Subsequent updates (app-only)
cdk deploy --region us-east-1 -c env=dev AppStack-dev

> Tip: the stack now honours a `-c region=<aws-region>` context override. Use it if you need to deploy an environment to a region different from the default defined in `config/environments.ts`.
```

## CI/CD (GitHub Actions)
A workflow in `.github/workflows/deploy.yml` automates build → test → deploy on pushes to `main`. Configure the repository secret `AWS_ROLE_TO_ASSUME` with the ARN of an IAM role trusted for GitHub OIDC (`sts:AssumeRoleWithWebIdentity`). The role needs permissions to deploy the stacks and publish CDK assets (ECR + S3) in the target account.

Adjust the region/stack variables at the top of the workflow if necessary. Ensure the environment has been bootstrapped (`cdk bootstrap`) so the CDK can provision asset repositories automatically.

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
