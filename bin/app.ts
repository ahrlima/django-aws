import * as cdk from "aws-cdk-lib";
import { resolveEnvironment } from "../config/environments";
import { globals, naming } from "../config/globals";
import { NetworkStack } from "../lib/stacks/network-stack";
import { DataStack } from "../lib/stacks/data-stack";
import { AppStack } from "../lib/stacks/app-stack";

const app = new cdk.App();
const envContext = app.node.tryGetContext("env") ?? app.node.tryGetContext("environment");
const explicitRegion = app.node.tryGetContext("region");
const { name: envName, config } = resolveEnvironment(envContext);
const region = typeof explicitRegion === "string" && explicitRegion.length > 0 ? explicitRegion : config.region;
const nameFor = (resource: string) =>
  naming({ env: envName, service: config.service, resource, client: config.client });

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region,
};

const networkStack = new NetworkStack(app, `NetworkStack-${envName}`, {
  env: stackEnv,
  envName,
  config,
  globals,
  nameFor,
});

const dataStack = new DataStack(app, `DataStack-${envName}`, {
  env: stackEnv,
  envName,
  config,
  globals,
  nameFor,
  vpc: networkStack.vpc,
});

const appStack = new AppStack(app, `AppStack-${envName}`, {
  env: stackEnv,
  envName,
  config,
  globals,
  nameFor,
  vpc: networkStack.vpc,
  database: dataStack.database,
  defaultImageTag: config.ecs.imageTag,
});

dataStack.addDependency(networkStack);
appStack.addDependency(dataStack);
