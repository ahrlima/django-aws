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

> The first `AppStack` deploy provisions the Amazon ECR repository (`EcrRepositoryUri`). Push an image tag (defaults to `config.ecs.imageTag`, e.g., `latest`) before expecting the ECS service to pass health checks.

> Because the app now synthesizes three stacks (`NetworkStack`, `DataStack`, and `AppStack`), the CDK CLI needs the explicit stack names (or `--all`) when you deploy.

> Development (`env=dev`) has `buildOnDeploy=true`, so `cdk deploy` rebuilds and publishes the container image automatically—no manual ECR push required.

## Configure environments
All environment-specific settings live in `config/environments.ts`. Duplicate the `dev` block or override the fields below to suit your deployment:
- `service` and `client` control the naming convention for AWS resources.
- `nat.useNatInstance` toggles the development NAT instance in place of NAT Gateways.
- `rds.enableReplica` provisions an optional read replica when set to `true`.
- The primary RDS instance is provisioned with deletion protection and a `RETAIN` removal policy so the database survives stack rollbacks or accidental deletes, and the DbInit Lambda now reads the master credentials from Secrets Manager instead of relying on IAM tokens.
- `ecs.buildOnDeploy` controls whether the Docker image is built during `cdk deploy`. Keep it `true` for `dev` so the asset is rebuilt automatically; set it to `false` for staging/production so they consume an already published tag.
- `ecs.repositoryName` and `ecs.manageRepository` configure the shared ECR repository when `buildOnDeploy=false`. Ensure exactly one environment sets `manageRepository=true` to create the repository.
- `ecs.imageTag` determines the default tag deployed when no `-c imageTag=` override is supplied (the CI pipeline passes the commit hash automatically for non-dev environments; `dev` uses `latest`).
- `observability.alertEmail` sets the destination for CloudWatch alarms.

Global defaults (naming, tagging, security toggles) are defined in `config/globals.ts`.

Pass `-c env=<name>` (or `-c environment=<name>`) to select which configuration block to deploy.

## Application image
For environments with `buildOnDeploy=true` (default `dev`) the CDK rebuilds and publishes the container image as part of `cdk deploy`, so no additional steps are required. For `buildOnDeploy=false` the ECS service expects an image to exist in the shared repository; use the flow below (or the CI pipeline) to publish the tag before deploying.

Example manual flow:

```bash
# After the first AppStack deploy, capture the repository URI from the stack outputs
REPO_URI=<account-id>.dkr.ecr.us-east-1.amazonaws.com/django-app
IMAGE_TAG=latest   # or whatever tag you plan to deploy

# Build & test locally (optional but recommended)
docker build -t myapp-under-test ./app
docker run --rm -e DJANGO_SETTINGS_MODULE=testapp.settings myapp-under-test python manage.py test

# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "${REPO_URI}"
docker tag myapp-under-test "${REPO_URI}:${IMAGE_TAG}"
docker push "${REPO_URI}:${IMAGE_TAG}"

# Deploy (example for staging)
cdk deploy --region us-east-1 -c env=hml -c imageTag=${IMAGE_TAG} NetworkStack-hml DataStack-hml AppStack-hml

# Subsequent app-only rollouts (non-dev)
cdk deploy --region us-east-1 -c env=hml -c imageTag=${IMAGE_TAG} AppStack-hml

# Development (build-on-deploy)
cdk deploy --region us-east-1 -c env=dev AppStack-dev

> Tip: the stack now honours a `-c region=<aws-region>` context override. Use it if you need to deploy an environment to a region different from the default defined in `config/environments.ts`.
```

## CI/CD (GitHub Actions)
A workflow in `.github/workflows/deploy.yml` automates build → test → push → deploy whenever changes land under `app/**`. Configure the repository secret `AWS_ROLE_TO_ASSUME` with the ARN of an IAM role trusted for GitHub OIDC (`sts:AssumeRoleWithWebIdentity`). The role needs permissions to push to ECR, run CDK (CloudFormation, IAM pass role), and access asset buckets in the target account.

The job runs once per environment provided. Pushes to `main` default to `["dev"]`; manual runs (`workflow_dispatch`) accept a JSON array such as `["hml","prd"]` and optionally an `imageTag` to redeploy a previously built artifact. Each matrix execution:
1. Builds the image and runs Django tests.
2. Resolves the environment-specific ECR repository from `AppStack-<env>` outputs.
3. Tags and pushes `${GITHUB_SHA::12}` (immutable) and `latest` to that repository; the `latest` alias is consumed by `dev` automatically.
4. Deploys `AppStack-<env>` with `-c env=<env> -c imageTag=<tag>` (uses `latest` implicitly for `dev` unless overridden).

Infrastructure stacks (`NetworkStack`, `DataStack`) remain manual so schema/network changes are deliberate (`cdk deploy ... NetworkStack-<env> DataStack-<env>`). Ensure the account is bootstrapped (`cdk bootstrap`), the shared ECR repository exists (deploy the managing environment once), and that the workflow `ECR_REPOSITORY` variable aligns with `config.ecs.repositoryName`.

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

## Future Improvements
- Integrate **Amazon Route 53** to provision custom DNS records for the ALB so the application is reached through branded hostnames instead of the default AWS address.
- Issue **AWS Certificate Manager** certificates and wire them into the ALB listeners to serve traffic over HTTPS (port 443) end-to-end.
- Replace the single-instance RDS with an **Amazon Aurora** cluster for improved availability, performance, and automatic storage scaling.
- Introduce blue/green deploys via **ECS CodeDeploy** (or Step Functions) so new task sets warm up behind the scenes before shifting traffic, enabling canary/linear rollouts and near-instant rollback.
- Add **Amazon Cognito** user pools (federated with IAM) to centralise identity and control which operators can access the AWS account and application backplane.

## NAT Instance (dev only)
See **DEVELOPER_GUIDE.md** for the cost rationale, security posture (Session Manager enabled), and production guidance when switching back to managed NAT Gateways.
