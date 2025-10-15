import { Tags } from "aws-cdk-lib";
import type { Construct } from "constructs";

export interface NamingInput {
  env: string;
  service: string;
  resource: string;
  client: string;
}

export interface GlobalTagValues {
  project: string;
  owner: string;
  managedBy: string;
  confidentiality: string;
}

export interface SecurityDefaults {
  enforceEncryptionAtRest: boolean;
  enforceTls: boolean;
  enableGuardDuty: boolean;
  enableWaf: boolean;
  logGroupPrefix: string;
  kmsAliases?: {
    logs?: string;
    rds?: string;
    general?: string;
  };
}

export interface GlobalsConfig {
  readonly tags: GlobalTagValues;
  readonly security: SecurityDefaults;
}

export function naming(input: NamingInput): string {
  return `${input.env}-${input.service}-${input.resource}-${input.client}`.toLowerCase();
}

export const globals: GlobalsConfig = {
  tags: {
    project: "django-ecs",
    owner: "platform-team",
    managedBy: "cdk",
    confidentiality: "internal",
  },
  security: {
    enforceEncryptionAtRest: true,
    enforceTls: false,
    enableGuardDuty: false,
    enableWaf: false,
    logGroupPrefix: "/aws/django-ecs",
    kmsAliases: {
      rds: "alias/aws/rds",
    },
  },
};

export function applyGlobalTags(
  scope: Construct,
  env: string,
  overrides?: Partial<GlobalTagValues>,
): void {
  const values = {
    ...globals.tags,
    ...overrides,
  };

  Tags.of(scope).add("Project", values.project);
  Tags.of(scope).add("Owner", values.owner);
  Tags.of(scope).add("ManagedBy", values.managedBy);
  Tags.of(scope).add("Confidentiality", values.confidentiality);
  Tags.of(scope).add("Environment", env);
}
