import type { GlobalTagValues } from "./globals";

export type EnvironmentName = "dev" | "hml" | "prd";

export interface VpcSettings {
  cidr: string;
  availabilityZones?: string[];
  natGatewayCount: number;
  useNatInstance: boolean;
}

export interface NatInstanceSettings {
  instanceType: string;
  allowSshFrom?: string[];
}

export interface RdsSettings {
  instanceType: string;
  allocatedStorage: number;
  multiAz: boolean;
  databaseName: string;
  adminUser: string;
  appUser: string;
  backupRetentionDays: number;
  enableReplica: boolean;
}

export interface EcsSettings {
  buildOnDeploy: boolean;
  cpu: number;
  memoryMiB: number;
  desiredCount: number;
  repositoryName?: string;
  manageRepository?: boolean;
  imageTag: string;
  containerPort: number;
  assignPublicIp: boolean;
  minCapacity: number;
  maxCapacity: number;
  scalingTargetUtilization: number;
  requestsPerTarget: number;
  certificateArn?: string;
}

export interface ObservabilityAlbAccessLogSettings {
  enabled: boolean;
  prefix?: string;
  expirationDays?: number;
}

export interface ObservabilitySettings {
  alertEmail?: string;
  logRetentionDays: number;
  albAccessLogs?: ObservabilityAlbAccessLogSettings;
}

export interface EnvironmentSettings {
  region: string;
  service: string;
  client: string;
  confidentiality?: string;
  vpc: VpcSettings;
  natInstance?: NatInstanceSettings;
  rds: RdsSettings;
  ecs: EcsSettings;
  observability: ObservabilitySettings;
  tagOverrides?: Partial<GlobalTagValues>;
}

const ENVIRONMENTS: Record<EnvironmentName, EnvironmentSettings> = {
  dev: {
    region: "us-east-1",
    service: "djg",
    client: "ander",
    confidentiality: "internal",
    vpc: {
      cidr: "10.10.0.0/16",
      availabilityZones: ["us-east-1a", "us-east-1b"],
      natGatewayCount: 1,
      useNatInstance: true,
    },
    natInstance: {
      instanceType: "t3.micro",
      allowSshFrom: [],
    },
    rds: {
      instanceType: "t3.micro",
      allocatedStorage: 20,
      multiAz: false,
      databaseName: "appdb",
      adminUser: "postgres",
      appUser: "app_user",
      backupRetentionDays: 7,
      enableReplica: false,
    },
    ecs: {
      buildOnDeploy: true,
      cpu: 256,
      memoryMiB: 512,
      desiredCount: 1,
      imageTag: "latest",
      containerPort: 8000,
      assignPublicIp: true,
      minCapacity: 1,
      maxCapacity: 5,
      scalingTargetUtilization: 60,
      requestsPerTarget: 200,
    },
    observability: {
      alertEmail: "alerts-dev@example.com",
      logRetentionDays: 7,
      albAccessLogs: {
        enabled: true,
        prefix: "dev",
        expirationDays: 30,
      },
    },
  },
  hml: {
    region: "us-east-1",
    service: "django",
    client: "and",
    confidentiality: "restricted",
    vpc: {
      cidr: "10.20.0.0/16",
      availabilityZones: ["us-east-1a", "us-east-1b"],
      natGatewayCount: 1,
      useNatInstance: false,
    },
    rds: {
      instanceType: "t3.micro",
      allocatedStorage: 50,
      multiAz: true,
      databaseName: "appdb",
      adminUser: "postgres",
      appUser: "app_user",
      backupRetentionDays: 14,
      enableReplica: false,
    },
    ecs: {
      buildOnDeploy: false,
      cpu: 512,
      memoryMiB: 1024,
      desiredCount: 2,
      repositoryName: "django-app",
      manageRepository: true,
      imageTag: "latest",
      containerPort: 8000,
      assignPublicIp: false,
      minCapacity: 1,
      maxCapacity: 6,
      scalingTargetUtilization: 60,
      requestsPerTarget: 800,
    },
    observability: {
      alertEmail: "alerts-hml@example.com",
      logRetentionDays: 14,
      albAccessLogs: {
        enabled: true,
        prefix: "hml",
        expirationDays: 45,
      },
    },
  },
  prd: {
    region: "us-east-1",
    service: "django",
    client: "and",
    confidentiality: "confidential",
    vpc: {
      cidr: "10.30.0.0/16",
      availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"],
      natGatewayCount: 3,
      useNatInstance: false,
    },
    rds: {
      instanceType: "t3.micro",
      allocatedStorage: 100,
      multiAz: true,
      databaseName: "appdb",
      adminUser: "postgres",
      appUser: "app_user",
      backupRetentionDays: 35,
      enableReplica: true,
    },
    ecs: {
      buildOnDeploy: false,
      cpu: 512,
      memoryMiB: 1024,
      desiredCount: 3,
      repositoryName: "django-app",
      manageRepository: false,
      imageTag: "latest",
      containerPort: 8000,
      assignPublicIp: false,
      minCapacity: 2,
      maxCapacity: 8,
      scalingTargetUtilization: 55,
      requestsPerTarget: 1200,
    },
    observability: {
      alertEmail: "alerts-prod@example.com",
      logRetentionDays: 30,
      albAccessLogs: {
        enabled: true,
        prefix: "prd",
        expirationDays: 90,
      },
    },
    tagOverrides: {
      confidentiality: "secret",
    },
  },
};

const DEFAULT_ENVIRONMENT: EnvironmentName = "dev";

export function resolveEnvironment(
  env?: string,
): { name: EnvironmentName; config: EnvironmentSettings } {
  const normalized = (env ?? DEFAULT_ENVIRONMENT).toLowerCase() as EnvironmentName;

  if (!(normalized in ENVIRONMENTS)) {
    const supported = Object.keys(ENVIRONMENTS).join(", ");
    throw new Error(
      `Unknown environment "${env}". Supported environments: ${supported}.`,
    );
  }

  return { name: normalized, config: ENVIRONMENTS[normalized] };
}
