import * as cdk from "aws-cdk-lib";
import { MainStack } from "../lib/main-stack";
import { resolveEnvironment } from "../config/environments";
import { globals } from "../config/globals";

const app = new cdk.App();
const envContext = app.node.tryGetContext("env") ?? app.node.tryGetContext("environment");
const { name: envName, config } = resolveEnvironment(envContext);

new MainStack(app, `MainStack-${envName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? config.region,
  },
  envName,
  config,
  globals,
});
