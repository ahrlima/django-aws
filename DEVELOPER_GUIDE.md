# Developer Guide — Django ECS on AWS CDK (TypeScript)

This document explains how to set up your environment, work with the CDK modules, and the rationale behind cost-aware choices (e.g., NAT Instance for dev).

## Prereqs
- Node.js 18+, AWS CDK v2, AWS CLI v2
- Docker (for Lambda bundling)
- Python 3.10+ (local testing for client libs)

## VS Code + ChatGPT/Codex
- Install the **OpenAI Codex (Official)** extension.
- Sign in with your OpenAI account (same used for ChatGPT).
- Use the side chat: `@workspace explain lib/constructs/vpc.ts`, refactor, generate docs, etc.

## Project Structure
```
lib/
  constructs/
    vpc.ts             # VPC with manual AZ selection, /26 public & /22 private
    nat-instance.ts    # EC2 NAT for dev/lab (Free Tier mode)
    rds.ts             # RDS Postgres with IAM Auth, deletion protection, Secrets Manager credentials, optional replica
    ecs.ts             # ECS Fargate + ALB + autoscaling
    observability.ts   # CloudWatch logs, metrics, SNS
  stacks/
    network-stack.ts   # Network foundation (VPC, NAT)
    data-stack.ts      # RDS + DbInit
    app-stack.ts       # Observability + ECS + ALB
config/
  environments.ts      # Per-environment settings (region, CIDR, scaling, emails)
  globals.ts           # Naming helpers, default tags, security toggles
lambda/
  db_init/             # Python Lambda to create DB roles & app_user
app/
  Dockerfile           # Builds the Django container image
  requirements.txt     # Python dependencies for the app
  manage.py            # Django management entrypoint
  testapp/             # Django project (views, urls, settings, tests)
```

## NAT Instance (Cost-Driven and Ethical Engineering Decision)

During development, we use a **NAT Instance (EC2 t3.micro)** instead of a NAT Gateway to keep costs within **AWS Free Tier**. This is controlled by CDK context:
```bash
-c useNatInstance=true
```

### Technical Rationale
- NAT Gateway is managed, HA, and production-ready — but **not Free Tier** (~US$ 32/month + data).
- NAT Instance uses the official AWS NAT AMI (`amzn-ami-vpc-nat-*`), sets `SourceDestCheck=false`, and attaches `AmazonSSMManagedInstanceCore` so you can use **Session Manager** (no SSH keys).

### How it Works
- When `useNatInstance=true`, the CDK sets `natGateways=0` and provisions a small EC2 in a public subnet to route outbound for private subnets.
- The instance public IP is exposed via a CloudFormation output.

### Best Practices
- ✅ Use **NAT Instance** for **dev/lab** only.
- 🚫 In **production**, switch to **NAT Gateway per AZ** (`natGatewayCount = number of AZs`).
- This choice is **documented and intentional**, demonstrating cost awareness without compromising architectural integrity.

## Deploy
```bash
npm install
cdk bootstrap aws://<your-account-id>/us-east-1
cdk deploy -c env=dev NetworkStack-dev DataStack-dev AppStack-dev
```

Deployment metadata (service name, client, NAT strategy, tags) is defined in
`config/environments.ts` and `config/globals.ts`, keeping stacks consistent across
the team.

Per-environment ECS settings include:
- `buildOnDeploy`: when `true` (e.g., `dev`) the CDK rebuilds the Docker image as part of `cdk deploy`; no external repository is required.
- `repositoryName`/`manageRepository`: used when `buildOnDeploy=false` to identify the shared Amazon ECR repository (set `manageRepository=true` for exactly one environment so the repository is created, others reuse it).
- `imageTag`: default tag consumed when `-c imageTag=` is not supplied (the CI pipeline passes the commit hash automatically; `dev` falls back to `latest`).

## CI/CD workflow
- Workflow file: `.github/workflows/deploy.yml`
- Trigger: push to `main` (and manual dispatch)
- Steps:
  1. Install CDK dependencies (`npm ci && npm run build`)
  2. Build the Docker image from `app/` and run `python manage.py test` inside the container
  3. (When `buildOnDeploy=false`) Look up the environment-specific ECR repository from `AppStack-<env>` outputs
  4. (When `buildOnDeploy=false`) Tag & push the image (`${GITHUB_SHA::12}`) and keep the `latest` alias up to date for development convenience
  5. Deploy the application stack via `cdk deploy -c env=<env> -c imageTag=<tag> AppStack-<env>` (for `buildOnDeploy=true`, simply run `cdk deploy -c env=dev AppStack-dev`)

Pushes target the `dev` environment by default. Manual runs can specify a JSON array of environments (e.g., `["dev","hml"]`) and optionally provide an `imageTag` to redeploy an already published artifact without rebuilding.

Infrastructure stacks (`NetworkStack`, `DataStack`) must be deployed manually when changes are required. Ensure the target account/region has been bootstrapped (`cdk bootstrap`) so the CDK can push Docker assets. Configure a repository secret `AWS_ROLE_TO_ASSUME` that points to an IAM role trusted for GitHub OIDC and permitted to deploy the stacks; the workflow uses that role instead of long-lived access keys. Deploy the “managing” environment (the one with `manageRepository=true`) once manually to create the shared ECR repository before allowing the workflow to publish images, and keep the workflow variable `ECR_REPOSITORY` aligned with `config.ecs.repositoryName`.

### Region overrides
The stack derives its AWS region from the environment configuration (`config/environments.ts`). To target a different region during deployment or CI, pass `-c region=<aws-region>` to `cdk synth|deploy`; that value takes precedence over both the environment file and shell variables such as `CDK_DEFAULT_REGION`.

## Roadmap / Future Improvements
- Front the ALB with Route 53 hosted zones and records to expose friendly application domains.
- Provision ACM certificates per environment and switch the ALB listeners to HTTPS (port 443).
- Migrate the database layer to Amazon Aurora for multi-AZ resilience and managed replicas.
- Integrate Amazon Cognito with IAM to centralise user lifecycle and control who can assume operational roles in the AWS account.

## Troubleshooting
- **Lambda db-init fails**: ensure private subnets have egress (NAT Instance or Gateway) and security groups allow 5432 to RDS.
- **Django cannot connect**: IAM token expires every ~15 minutes. The app should regenerate it on reconnect; ensure SSL is `require`.
- **ALB health check failing**: confirm your container answers `/healthz` on port 8000 or adjust in `ecs.ts`.

## Ethical AI Usage
Some boilerplate was accelerated using ChatGPT/Codex as a code assistant. All architectural decisions, reviews, and validations were performed manually.
