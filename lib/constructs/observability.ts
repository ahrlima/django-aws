import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as kms from "aws-cdk-lib/aws-kms";

export interface ObservabilityProps {
  namer: (resource: string) => string;
  logGroupPrefix: string;
  logRetentionDays: number;
  logKmsAlias?: string;
  alertEmail?: string;
}

/**
 * Centralises logging and alarm primitives while aligning resource names with
 * global standards and optional KMS encryption controls.
 */
export class ObservabilityConstruct extends Construct {
  readonly logGroup: logs.LogGroup;
  readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: ObservabilityProps) {
    super(scope, id);

    const kmsKey = props.logKmsAlias
      ? kms.Alias.fromAliasName(this, "LogGroupKmsAlias", props.logKmsAlias)
      : undefined;

    this.logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `${props.logGroupPrefix}/${props.namer("service")}`,
      retention: resolveRetention(props.logRetentionDays),
      encryptionKey: kmsKey,
    });

    this.alarmTopic = new sns.Topic(this, "AlarmTopic", {
      topicName: props.namer("sns-alarms"),
      displayName: props.namer("sns-alarms"),
    });

    if (props.alertEmail) {
      this.alarmTopic.addSubscription(new subs.EmailSubscription(props.alertEmail));
    }
  }

  /**
   * Attaches CPU and memory alarms to the provided ECS service.
   */
  configureServiceAlarms(service: ecs.FargateService): void {
    const cpuAlarm = new cloudwatch.Alarm(this, "CpuAlarm", {
      alarmName: service.serviceName
        ? `${service.serviceName}-cpu-utilization`
        : undefined,
      metric: service.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      datapointsToAlarm: 2,
      alarmDescription: "CPU utilisation sustained above 80%",
    });
    cpuAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });

    const memoryAlarm = new cloudwatch.Alarm(this, "MemoryAlarm", {
      alarmName: service.serviceName
        ? `${service.serviceName}-memory-utilization`
        : undefined,
      metric: service.metricMemoryUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      datapointsToAlarm: 2,
      alarmDescription: "Memory utilisation sustained above 80%",
    });
    memoryAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });
  }

  /**
   * Configures 5xx alarms on the supplied Application Load Balancer.
   */
  configureAlbAlarms(alb: elbv2.ApplicationLoadBalancer): void {
    const alb5xx = new cloudwatch.Metric({
      namespace: "AWS/ApplicationELB",
      metricName: "HTTPCode_Target_5XX_Count",
      dimensionsMap: { LoadBalancer: alb.loadBalancerFullName },
      statistic: "Sum",
      period: cdk.Duration.minutes(5),
    });

    const alarm = new cloudwatch.Alarm(this, "Alb5xxAlarm", {
      alarmName: `${alb.loadBalancerName}-5xx`,
      metric: alb5xx,
      threshold: 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "ALB target group returning high rate of 5xx responses",
    });

    alarm.addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });
  }
}

function resolveRetention(days: number): logs.RetentionDays {
  const mapping: Record<number, logs.RetentionDays> = {
    1: logs.RetentionDays.ONE_DAY,
    3: logs.RetentionDays.THREE_DAYS,
    5: logs.RetentionDays.FIVE_DAYS,
    7: logs.RetentionDays.ONE_WEEK,
    14: logs.RetentionDays.TWO_WEEKS,
    30: logs.RetentionDays.ONE_MONTH,
    60: logs.RetentionDays.TWO_MONTHS,
    90: logs.RetentionDays.THREE_MONTHS,
    180: logs.RetentionDays.SIX_MONTHS,
    365: logs.RetentionDays.ONE_YEAR,
    730: logs.RetentionDays.TWO_YEARS,
    1825: logs.RetentionDays.FIVE_YEARS,
    3650: logs.RetentionDays.TEN_YEARS,
  };

  return mapping[days] ?? logs.RetentionDays.ONE_WEEK;
}
