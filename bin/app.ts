import * as cdk from "aws-cdk-lib";
import { MainStack } from "../lib/main-stack.js";
import { resolveEnvironmentConfig } from "../lib/config/env-config.js";

const app = new cdk.App();
const envContext = app.node.tryGetContext("env") ?? app.node.tryGetContext("environment");
const { name: envName, config } = resolveEnvironmentConfig(envContext);

new MainStack(app, `MainStack-${envName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  envName,
  config,
});
