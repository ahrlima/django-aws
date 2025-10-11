export interface EnvironmentConfig {
  /**
   * Short service identifier used when building resource names.
   */
  service: string;
  /**
   * Customer or tenant identifier used when building resource names.
   */
  client: string;
  /**
   * CIDR block assigned to the VPC for this environment.
   */
  cidr: string;
  nat: {
    /**
     * When true, a NAT instance is provisioned and NAT gateways are disabled.
     */
    useNatInstance: boolean;
    /**
     * Desired NAT Gateway count. Ignored when `useNatInstance` is true.
     */
    natGatewayCount: number;
  };
  rds: {
    /**
     * Allocated storage size (GiB) for the primary database instance.
     */
    allocatedStorage: number;
    /**
     * Whether to deploy the primary database in Multi-AZ mode.
     */
    multiAz: boolean;
    /**
     * Whether to provision a read replica for this environment.
     */
    enableReplica: boolean;
  };
  observability?: {
    /**
     * Email address that should receive alert notifications.
     */
    alertEmail?: string;
  };
  ecs?: {
    /**
     * CPU units for the Fargate task definition.
     */
    cpu?: number;
    /**
     * Memory (MiB) for the Fargate task definition.
     */
    memoryMiB?: number;
    /**
     * Desired task count for the ECS service.
     */
    desiredCount?: number;
    /**
     * Container image reference for the application.
     */
    image?: string;
  };
}

export type EnvironmentName = "dev" | "hml" | "prd";

export const ENV_CONFIG: Record<EnvironmentName, EnvironmentConfig> = {
  dev: {
    service: "django",
    client: "matific",
    cidr: "10.10.0.0/16",
    nat: {
      useNatInstance: true,
      natGatewayCount: 1,
    },
    rds: {
      allocatedStorage: 20,
      multiAz: false,
      enableReplica: false,
    },
    observability: {
      alertEmail: "alerts-dev@example.com",
    },
    ecs: {
      cpu: 256,
      memoryMiB: 512,
      desiredCount: 1,
      image: "public.ecr.aws/docker/library/nginx:latest",
    },
  },
};

const DEFAULT_ENVIRONMENT: EnvironmentName = "dev";

export function resolveEnvironmentConfig(env?: string) {
  const normalized = (env ?? DEFAULT_ENVIRONMENT).toLowerCase();

  if (!(normalized in ENV_CONFIG)) {
    const supported = Object.keys(ENV_CONFIG).join(", ");
    throw new Error(
      `Unknown environment "${env}". Supported environments: ${supported}.`,
    );
  }

  const envName = normalized as EnvironmentName;
  return {
    name: envName,
    config: ENV_CONFIG[envName],
  };
}
