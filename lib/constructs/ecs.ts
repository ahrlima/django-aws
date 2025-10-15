import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as logs from "aws-cdk-lib/aws-logs";
import type { SecurityDefaults } from "../../config/globals";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export interface EcsConstructProps {
  vpc: ec2.IVpc;
  namer: (resource: string) => string;
  security: SecurityDefaults;
  cpu: number;
  memoryMiB: number;
  desiredCount: number;
  repository: ecr.IRepository;
  imageTag: string;
  containerPort: number;
  assignPublicIp: boolean;
  minCapacity: number;
  maxCapacity: number;
  scalingTargetUtilization: number;
  certificateArn?: string;
  logGroup: logs.ILogGroup;
  database: rds.DatabaseInstance;
  databaseSecret: secretsmanager.ISecret;
  databaseName: string;
  databaseUser: string;
  environmentName: string;
  region: string;
  databaseSecurityGroupIds: string[];
  databasePort?: number;
}

/**
 * Creates the ECS Fargate control plane with ALB routing, applying global
 * naming, scaling defaults, and database IAM policies.
 */
export class EcsConstruct extends Construct {
  readonly service: ecs.FargateService;
  readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: EcsConstructProps) {
    super(scope, id);

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc: props.vpc,
      clusterName: props.namer("ecs-cluster"),
    });

    const serviceSecurityGroup = new ec2.SecurityGroup(this, "ServiceSecurityGroup", {
      vpc: props.vpc,
      allowAllOutbound: true,
      securityGroupName: props.namer("sg-ecs"),
      description: "Security group for ECS service tasks",
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
      cpu: props.cpu,
      memoryLimitMiB: props.memoryMiB,
    });

    taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ["rds-db:connect"],
        resources: [
          `arn:aws:rds-db:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:dbuser:*/${props.databaseUser}`,
        ],
      }),
    );

    taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ["rds:GenerateDbAuthToken"],
        resources: ["*"],
      }),
    );

    taskDefinition.addContainer("AppContainer", {
      containerName: props.namer("container"),
      image: ecs.ContainerImage.fromEcrRepository(props.repository, props.imageTag),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: props.logGroup,
        streamPrefix: props.namer("stream"),
      }),
      portMappings: [{ containerPort: props.containerPort }],
      environment: {
        ENVIRONMENT: props.environmentName,
        AWS_REGION: props.region,
        DB_NAME: props.databaseName,
        DB_USER: props.databaseUser,
        DB_HOST: props.database.dbInstanceEndpointAddress,
      },
      secrets: {
        DB_PASSWORD: ecs.Secret.fromSecretsManager(props.databaseSecret, "password"),
      },
    });

    this.service = new ecs.FargateService(this, "Service", {
      serviceName: props.namer("service"),
      cluster,
      taskDefinition,
      desiredCount: props.desiredCount,
      assignPublicIp: props.assignPublicIp,
      circuitBreaker: { enable: true, rollback: true },
      securityGroups: [serviceSecurityGroup],
    });

    const scaling = this.service.autoScaleTaskCount({
      minCapacity: props.minCapacity,
      maxCapacity: props.maxCapacity,
    });

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: props.scalingTargetUtilization,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: props.scalingTargetUtilization,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    this.alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc: props.vpc,
      loadBalancerName: props.namer("alb"),
      internetFacing: true,
    });

    const targetProps: elbv2.AddApplicationTargetsProps = {
      targetGroupName: props.namer("alb-target"),
      targets: [this.service],
      port: props.containerPort,
      healthCheck: { path: "/healthz" },
    };

    if (props.security.enforceTls) {
      if (!props.certificateArn) {
        throw new Error(
          "TLS enforcement enabled but no ecs.certificateArn configured for HTTPS listener.",
        );
      }

      const httpsListener = this.alb.addListener("HttpsListener", {
        port: 443,
        open: true,
        certificates: [elbv2.ListenerCertificate.fromArn(props.certificateArn)],
      });

      httpsListener.addTargets("HttpsTarget", targetProps);

      this.alb.addListener("HttpRedirect", {
        port: 80,
        open: true,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: "HTTPS",
          port: "443",
          permanent: true,
        }),
      });
    } else {
      const httpListener = this.alb.addListener("HttpListener", {
        port: 80,
        open: true,
      });

      httpListener.addTargets("HttpTarget", targetProps);
    }

    this.service.connections.allowFrom(
      this.alb,
      ec2.Port.tcp(props.containerPort),
      "Allow ALB to reach service tasks",
    );
    const dbPort = props.databasePort ?? 5432;

    props.databaseSecurityGroupIds.forEach((groupId, index) => {
      new ec2.CfnSecurityGroupIngress(this, `DbIngress${index}`, {
        groupId,
        sourceSecurityGroupId: serviceSecurityGroup.securityGroupId,
        ipProtocol: "tcp",
        fromPort: dbPort,
        toPort: dbPort,
        description: "Allow ECS tasks to reach PostgreSQL",
      });
    });
  }
}
