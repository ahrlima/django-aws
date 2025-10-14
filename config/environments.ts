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
  deletionProtection: boolean;
  enableReplica: boolean;
}

export interface EcsSettings {
  cpu: number;
  memoryMiB: number;
  desiredCount: number;
  image: string;
  containerPort: number;
  assignPublicIp: boolean;
  minCapacity: number;
  maxCapacity: number;
  scalingTargetUtilization: number;
  certificateArn?: string;
}

export interface ObservabilitySettings {
  alertEmail?: string;
  logRetentionDays: number;
}

export interface RemoteStateSettings {
  enabled: boolean;
  bucketName?: string;
  tableName?: string;
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
  remoteState?: RemoteStateSettings;
  tagOverrides?: Partial<GlobalTagValues>;
}

const ENVIRONMENTS: Record<EnvironmentName, EnvironmentSettings> = {
  dev: {
    region: "us-east-1",
    service: "django",
    client: "matific",
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
      deletionProtection: false,
      enableReplica: false,
    },
    ecs: {
      cpu: 256,
      memoryMiB: 512,
      desiredCount: 1,
      image: "public.ecr.aws/docker/library/nginx:latest",
      containerPort: 8000,
      assignPublicIp: true,
      minCapacity: 1,
      maxCapacity: 5,
      scalingTargetUtilization: 60,
    },
    observability: {
      alertEmail: "alerts-dev@example.com",
      logRetentionDays: 7,
    },
    remoteState: {
      enabled: true,
    },
  },
  hml: {
    region: "us-east-1",
    service: "django",
    client: "matific",
    confidentiality: "restricted",
    vpc: {
      cidr: "10.20.0.0/16",
      availabilityZones: ["us-east-1a", "us-east-1b"],
      natGatewayCount: 1,
      useNatInstance: false,
    },
    rds: {
      instanceType: "t3.small",
      allocatedStorage: 50,
      multiAz: true,
      databaseName: "appdb",
      adminUser: "postgres",
      appUser: "app_user",
      backupRetentionDays: 14,
      deletionProtection: true,
      enableReplica: false,
    },
    ecs: {
      cpu: 512,
      memoryMiB: 1024,
      desiredCount: 2,
      image: "public.ecr.aws/docker/library/nginx:latest",
      containerPort: 8000,
      assignPublicIp: false,
      minCapacity: 1,
      maxCapacity: 6,
      scalingTargetUtilization: 60,
    },
    observability: {
      alertEmail: "alerts-hml@example.com",
      logRetentionDays: 14,
    },
    remoteState: {
      enabled: true,
    },
  },
  prd: {
    region: "us-east-1",
    service: "django",
    client: "matific",
    confidentiality: "confidential",
    vpc: {
      cidr: "10.30.0.0/16",
      availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"],
      natGatewayCount: 3,
      useNatInstance: false,
    },
    rds: {
      instanceType: "t3.small",
      allocatedStorage: 100,
      multiAz: true,
      databaseName: "appdb",
      adminUser: "postgres",
      appUser: "app_user",
      backupRetentionDays: 35,
      deletionProtection: true,
      enableReplica: true,
    },
    ecs: {
      cpu: 512,
      memoryMiB: 1024,
      desiredCount: 3,
      image: "public.ecr.aws/docker/library/nginx:latest",
      containerPort: 8000,
      assignPublicIp: false,
      minCapacity: 2,
      maxCapacity: 8,
      scalingTargetUtilization: 55,
    },
    observability: {
      alertEmail: "alerts-prod@example.com",
      logRetentionDays: 30,
    },
    remoteState: {
      enabled: true,
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
