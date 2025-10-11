import { Construct } from "constructs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as cdk from "aws-cdk-lib";

export interface ObservabilityProps {
  baseName: string;
  service?: ecs.FargateService;
  alb?: elbv2.ApplicationLoadBalancer;
  alertEmail?: string;
}

export class ObservabilityConstruct extends Construct {
  readonly logGroup: logs.LogGroup;
  readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, p: ObservabilityProps) {
    super(scope, id);

    this.logGroup = new logs.LogGroup(this, `LogGroup-${p.baseName}`, {
      logGroupName: `/ecs/${p.baseName}`,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    this.alarmTopic = new sns.Topic(this, `AlarmTopic-${p.baseName}`, {
      displayName: `${p.baseName}-alarms`,
    });
    if (p.alertEmail) this.alarmTopic.addSubscription(new subs.EmailSubscription(p.alertEmail));

    if (p.service) {
      const cpu = p.service.metricCpuUtilization();
      new cloudwatch.Alarm(this, `CpuAlarm-${p.baseName}`, {
        metric: cpu, threshold: 80, evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        alarmDescription: `High CPU ${p.baseName}`, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }).addAlarmAction({ bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }) });

      const mem = p.service.metricMemoryUtilization();
      new cloudwatch.Alarm(this, `MemAlarm-${p.baseName}`, {
        metric: mem, threshold: 80, evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        alarmDescription: `High Memory ${p.baseName}`, treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }).addAlarmAction({ bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }) });
    }

    if (p.alb) {
      const alb5xx = new cloudwatch.Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "HTTPCode_Target_5XX_Count",
        dimensionsMap: { LoadBalancer: p.alb.loadBalancerFullName },
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      });
      new cloudwatch.Alarm(this, `Alb5xx-${p.baseName}`, {
        metric: alb5xx, threshold: 5, evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        alarmDescription: `High 5xx on ALB ${p.baseName}`,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      }).addAlarmAction({ bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }) });
    }
  }
}
