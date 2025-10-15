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
cdk deploy --region us-east-1 -c env=dev
```

> Replace the container image in `lib/constructs/ecs.ts` (or the matching entry in `config/environments.ts`) with the image you publish to ECR for your Django app.

## Configure environments
All environment-specific settings live in `config/environments.ts`. Duplicate the `dev` block or override the fields below to suit your deployment:
- `service` and `client` control the naming convention for AWS resources.
- `nat.useNatInstance` toggles the development NAT instance in place of NAT Gateways.
- `rds.enableReplica` provisions an optional read replica when set to `true`.
- `ecs.imageTag` chooses which tag the ECS service should deploy from the provisioned ECR repository.
- `observability.alertEmail` sets the destination for CloudWatch alarms.

Global defaults (naming, tagging, security toggles) are defined in `config/globals.ts`.

Pass `-c env=<name>` (or `-c environment=<name>`) to select which configuration block to deploy.

## Application image
The stack now creates an Amazon ECR repository (`EcrRepositoryUri` output). Build the container in `app/`, push it to that repository, and update the running service by supplying the new tag (`-c imageTag=<tag>`). The default configuration ships with `imageTag: "latest"` for local iteration.

Example manual flow:

```bash
# Build & test locally
docker build -t myapp ./app
docker run --rm myapp python manage.py test

# Authenticate to ECR and push
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker tag myapp <repo-uri>:latest
docker push <repo-uri>:latest

# Deploy infrastructure/tasks with that tag
cdk deploy --region us-east-1 -c env=dev -c imageTag=latest

> Tip: the stack now honours a `-c region=<aws-region>` context override. Use it if you need to deploy an environment to a region different from the default defined in `config/environments.ts`.
```

## CI/CD (GitHub Actions)
A workflow in `.github/workflows/deploy.yml` automates build → test → push → deploy on pushes to `main`. Configure the repository secret `AWS_ROLE_TO_ASSUME` with the ARN of an IAM role trusted for GitHub OIDC (`sts:AssumeRoleWithWebIdentity`). The role needs permissions to push to ECR and run CDK.

Adjust the region/stack variables at the top of the workflow if necessary. Perform the first deploy manually (`cdk deploy -c env=dev`) to create the ECR repository before the pipeline attempts to push.

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
