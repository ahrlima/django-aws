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
    rds.ts             # RDS Postgres with IAM Auth, deletion protection, and optional replica
    ecs.ts             # ECS Fargate + ALB + autoscaling
    observability.ts   # CloudWatch logs, metrics, SNS
  main-stack.ts        # Orchestration of all modules
config/
  environments.ts      # Per-environment settings (region, CIDR, scaling, emails)
  globals.ts           # Naming helpers, default tags, security toggles
lambda/
  db_init/             # Python Lambda to create DB roles & app_user
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
cdk deploy -c env=dev
```

Deployment metadata (service name, client, NAT strategy, tags) is defined in
`config/environments.ts` and `config/globals.ts`, keeping stacks consistent across
the team.

## CI/CD workflow
- Workflow file: `.github/workflows/deploy.yml`
- Trigger: push to `main` (and manual dispatch)
- Steps:
  1. Install CDK dependencies (`npm ci && npm run build`)
  2. Derive the repo URI from the deployed stack output
  3. Build the Docker image from `app/`, run `python manage.py test` inside the container
  4. Push the image to ECR
5. Deploy the stack via `cdk deploy -c env=dev -c imageTag=<commit-sha>`

Make sure the stack has been deployed once manually so the ECR repository exists. Configure a repository secret `AWS_ROLE_TO_ASSUME` that points to an IAM role trusted for GitHub OIDC and permitted to deploy the stack; the workflow uses that role instead of long-lived access keys.

### Region overrides
The stack derives its AWS region from the environment configuration (`config/environments.ts`). To target a different region during deployment or CI, pass `-c region=<aws-region>` to `cdk synth|deploy`; that value takes precedence over both the environment file and shell variables such as `CDK_DEFAULT_REGION`.

## Troubleshooting
- **Lambda db-init fails**: ensure private subnets have egress (NAT Instance or Gateway) and security groups allow 5432 to RDS.
- **Django cannot connect**: IAM token expires every ~15 minutes. The app should regenerate it on reconnect; ensure SSL is `require`.
- **ALB health check failing**: confirm your container answers `/healthz` on port 8000 or adjust in `ecs.ts`.

## Ethical AI Usage
Some boilerplate was accelerated using ChatGPT/Codex as a code assistant. All architectural decisions, reviews, and validations were performed manually.
