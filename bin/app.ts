import * as cdk from "aws-cdk-lib";
import { MainStack } from "../lib/main-stack";
import { resolveEnvironment } from "../config/environments";
import { globals } from "../config/globals";

const app = new cdk.App();
const envContext = app.node.tryGetContext("env") ?? app.node.tryGetContext("environment");
const explicitRegion = app.node.tryGetContext("region");
const { name: envName, config } = resolveEnvironment(envContext);
const region = typeof explicitRegion === "string" && explicitRegion.length > 0 ? explicitRegion : config.region;

new MainStack(app, `MainStack-${envName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region,
  },
  envName,
  config,
  globals,
});
