import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as logs from "aws-cdk-lib/aws-logs";

export interface EcsConstructProps {
  vpc: ec2.IVpc;
  baseName: string;
  cpu: number;
  memoryMiB: number;
  desiredCount: number;
  image: string;
  logGroup: logs.ILogGroup;
  database: rds.DatabaseInstance;
}

export class EcsConstruct extends Construct {
  readonly service: ecs.FargateService;
  readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, p: EcsConstructProps) {
    super(scope, id);

    const cluster = new ecs.Cluster(this, `Cluster-${p.baseName}`, { vpc: p.vpc });

    const taskDef = new ecs.FargateTaskDefinition(this, `Task-${p.baseName}`, {
      cpu: p.cpu,
      memoryLimitMiB: p.memoryMiB,
    });

    taskDef.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: ["rds-db:connect"],
      resources: [`arn:aws:rds-db:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:dbuser:*/app_user`],
    }));

    taskDef.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: ["rds:GenerateDbAuthToken"],
      resources: ["*"],
    }));

    const container = taskDef.addContainer(`App-${p.baseName}`, {
      image: ecs.ContainerImage.fromRegistry(p.image),
      logging: ecs.LogDrivers.awsLogs({ logGroup: p.logGroup, streamPrefix: p.baseName }),
      portMappings: [{ containerPort: 8000 }],
      environment: {
        ENVIRONMENT: p.baseName.split("-")[1],
        AWS_REGION: cdk.Stack.of(this).region,
        DB_NAME: "appdb",
        DB_USER: "app_user",
        DB_HOST: p.database.dbInstanceEndpointAddress,
      },
    });

    this.service = new ecs.FargateService(this, `Svc-${p.baseName}`, {
      cluster,
      taskDefinition: taskDef,
      desiredCount: p.desiredCount,
      assignPublicIp: true,
      circuitBreaker: { enable: true, rollback: true },
    });

    // Auto Scaling
    const scaling = this.service.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 5 });
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });
    scaling.scaleOnMemoryUtilization("MemScaling", {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // ALB
    this.alb = new elbv2.ApplicationLoadBalancer(this, `Alb-${p.baseName}`, {
      vpc: p.vpc,
      internetFacing: true,
    });
    const listener = this.alb.addListener(`Http-${p.baseName}`, { port: 80, open: true });
    listener.addTargets(`Tg-${p.baseName}`, {
      targets: [this.service],
      port: 80,
      healthCheck: { path: "/healthz" },
    });

    this.service.connections.allowFrom(this.alb, ec2.Port.tcp(8000));
    p.database.connections.allowFrom(this.service, ec2.Port.tcp(5432));
  }
}
