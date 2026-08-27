/**
 * Start-EMR Lambda: Triggered after dump completes (S3 put event or Lambda
 * chaining). Starts a transient EMR cluster (1 m5.large master + 1 m5.large
 * core), submits a PySpark step referencing the script in S3, and polls until
 * completion. Shuts down the cluster automatically.
 */
import {
  EMRClient,
  RunJobFlowCommand,
  DescribeClusterCommand,
  TerminateJobFlowsCommand,
} from "@aws-sdk/client-emr";

export interface StartEmrConfig {
  region: string;
  subnetId: string;
  emrServiceRole: string;
  emrInstanceProfile: string;
  ec2KeyName: string | undefined;
  stagingBucket: string;
  stagingPrefix: string;
  outputBucket: string;
  outputPrefix: string;
  scriptBucket: string;
  scriptKey: string;
  logBucket: string;
  logPrefix: string;
  clusterPollIntervalMs: number;
  clusterTimeoutMs: number;
}

interface EmrResult {
  success: boolean;
  clusterId: string | null;
  stepId: string | null;
  message: string;
  startedAt: string;
  completedAt: string | null;
}

function loadConfig(): StartEmrConfig {
  const required = {
    REGION: process.env.AWS_REGION ?? "us-east-1",
    SUBNET_ID: process.env.SUBNET_ID,
    EMR_SERVICE_ROLE: process.env.EMR_SERVICE_ROLE ?? "EMR_DefaultRole",
    EMR_INSTANCE_PROFILE:
      process.env.EMR_INSTANCE_PROFILE ?? "EMR_EC2_DefaultRole",
    STAGING_BUCKET: process.env.STAGING_BUCKET,
    OUTPUT_BUCKET: process.env.OUTPUT_BUCKET,
    SCRIPT_BUCKET: process.env.SCRIPT_BUCKET,
    SCRIPT_KEY: process.env.SCRIPT_KEY,
    LOG_BUCKET: process.env.LOG_BUCKET,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(`missing required env: ${missing.join(", ")}`);
  }

  return {
    region: required.REGION!,
    subnetId: required.SUBNET_ID!,
    emrServiceRole: required.EMR_SERVICE_ROLE!,
    emrInstanceProfile: required.EMR_INSTANCE_PROFILE!,
    ec2KeyName: process.env.EC2_KEY_NAME,
    stagingBucket: required.STAGING_BUCKET!,
    stagingPrefix: process.env.STAGING_PREFIX ?? "analytics/staging",
    outputBucket: required.OUTPUT_BUCKET!,
    outputPrefix: process.env.OUTPUT_PREFIX ?? "analytics/output",
    scriptBucket: required.SCRIPT_BUCKET!,
    scriptKey: required.SCRIPT_KEY!,
    logBucket: required.LOG_BUCKET!,
    logPrefix: process.env.LOG_PREFIX ?? "analytics/emr-logs",
    clusterPollIntervalMs: Number(
      process.env.CLUSTER_POLL_INTERVAL_MS ?? 30_000,
    ),
    clusterTimeoutMs: Number(process.env.CLUSTER_TIMEOUT_MS ?? 600_000),
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handler(
  event: Record<string, unknown>,
): Promise<EmrResult> {
  const config = loadConfig();
  const emr = new EMRClient({ region: config.region });
  const startedAt = new Date().toISOString();

  try {
    // 1. Find the latest staging path
    const stagingPath =
      (event.stagingPath as string) ??
      `${config.stagingPrefix}/${new Date().toISOString().replace(/[:-]/g, "").split(".")[0]!}`;
    const outputPath = `${config.outputPrefix}/${new Date().toISOString().replace(/[:-]/g, "").split(".")[0]!}`;

    // 2. Start transient EMR cluster
    const runJobFlowResponse = await emr.send(
      new RunJobFlowCommand({
        Name: "rmit-society-analytics",
        ReleaseLabel: "emr-7.2.0",
        LogUri: `s3://${config.logBucket}/${config.logPrefix}`,
        Instances: {
          InstanceGroups: [
            {
              InstanceRole: "MASTER",
              InstanceCount: 1,
              InstanceType: "m5.large",
              Market: "ON_DEMAND",
            },
            {
              InstanceRole: "CORE",
              InstanceCount: 1,
              InstanceType: "m5.large",
              Market: "ON_DEMAND",
            },
          ],
          Ec2KeyName: config.ec2KeyName,
          Ec2SubnetId: config.subnetId,
          KeepJobFlowAliveWhenNoSteps: false,
          TerminationProtected: false,
        },
        Applications: [{ Name: "Spark" }],
        JobFlowRole: config.emrInstanceProfile,
        ServiceRole: config.emrServiceRole,
        VisibleToAllUsers: true,
        Steps: [
          {
            Name: "Compute Analytics Metrics",
            ActionOnFailure: "TERMINATE_CLUSTER",
            HadoopJarStep: {
              Jar: "command-runner.jar",
              Args: [
                "spark-submit",
                "--deploy-mode",
                "cluster",
                `s3://${config.scriptBucket}/${config.scriptKey}`,
                "--staging-bucket",
                config.stagingBucket,
                "--staging-path",
                stagingPath,
                "--output-bucket",
                config.outputBucket,
                "--output-path",
                outputPath,
              ],
            },
          },
        ],
      }),
    );

    const clusterId = runJobFlowResponse.JobFlowId;
    if (!clusterId)
      throw new Error("EMR cluster creation returned no JobFlowId");

    // 3. Poll until cluster completes (WAITING or TERMINATED)
    const deadline = Date.now() + config.clusterTimeoutMs;
    let clusterState = "";
    do {
      await sleep(config.clusterPollIntervalMs);

      if (Date.now() > deadline) {
        await emr.send(
          new TerminateJobFlowsCommand({ JobFlowIds: [clusterId] }),
        );
        return {
          success: false,
          clusterId,
          stepId: null,
          message: "EMR cluster timed out and was terminated",
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      const describeResponse = await emr.send(
        new DescribeClusterCommand({ ClusterId: clusterId }),
      );
      clusterState = describeResponse.Cluster?.Status?.State ?? "UNKNOWN";
    } while (clusterState !== "TERMINATED" && clusterState !== "WAITING");

    // RunJobFlow does not return an ID for steps submitted with the request.
    return {
      success: clusterState === "TERMINATED",
      clusterId,
      stepId: null,
      message: `EMR cluster ${clusterId} completed with state ${clusterState}`,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      clusterId: null,
      stepId: null,
      message,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}
