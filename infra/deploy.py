#!/usr/bin/env python3
"""Idempotent boto3 infrastructure provisioning for the RMIT Society forum.

No CloudFormation/CDK is used: this script directly declares and reconciles
the AWS resources the rmit_society backend requires:
  - DynamoDB single table with the GSIs used by the repository adapter
  - Private media and analytics S3 buckets (+ web bucket for the SPA)
  - FIFO SQS queues and DLQs (moderation, image, event)
  - S3 media-bucket notification -> image queue
  - Glue database + forum_events table and Athena workgroup
  - ECR repository and ECS Fargate cluster/task definition
  - EC2 backend instance running the unified FastAPI server
  - Cognito user pool and SPA client
  - IAM roles and CloudWatch log group

The backend API runs as a persistent server on EC2 (dev/prod) rather than as
Lambda functions, so local development is a plain uvicorn process. SQS
consumers (moderation/image/events) remain Lambda functions. CloudFront
provisioning is wired in but only runs once the SPA build is ready.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import platform as _platform
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import boto3
from botocore.exceptions import ClientError

from package_lambda import package_lambda

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / ".cloudpulse" / "outputs.json"
PROJECT = "rmit-society"


def _host_machine() -> str:
    """Return the host CPU architecture (lowercase).

    On macOS an x86_64 interpreter under Rosetta reports itself as x86_64 even
    on arm64 hardware, which would mis-target the Lambda archive. Query the
    kernel/OS directly to get the real machine (matters for the local arm64
    MiniStack runtime).
    """
    if sys.platform == "darwin":
        try:
            # hw.optional.arm64 reports the hardware capability even when an
            # x86_64 interpreter runs under Rosetta (where hw.machine lies and
            # returns x86_64 for the translated context).
            optional = subprocess.check_output(["sysctl", "-n", "hw.optional.arm64"]).decode().strip()
            if optional.strip().lower() == "1":
                return "arm64"
            return subprocess.check_output(["sysctl", "-n", "hw.machine"]).decode().strip().lower()
        except Exception:
            pass
    return _platform.machine().lower()


def _lambda_arch(stage: str) -> str:
    """Return the Lambda Architectures value matching the built archive."""
    return "arm64" if _lambda_platform(stage) == "aarch64-manylinux2014" else "x86_64"


def _lambda_platform(stage: str) -> str:
    """Pick the manylinux target for the Lambda archive.

    Real x86_64 AWS Lambdas need x86_64 wheels. Local MiniStack executes
    functions via a Docker runtime container whose CPU matches the host, so
    local builds follow the host architecture (aarch64 on Apple Silicon).
    """
    if stage != "local":
        return "x86_64-manylinux2014"
    machine = _host_machine()
    return "aarch64-manylinux2014" if machine in {"arm64", "aarch64"} else "x86_64-manylinux2014"



def error_code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", ""))


@dataclass(frozen=True)
class Names:
    stage: str
    account_id: str

    @property
    def prefix(self) -> str:
        return f"{PROJECT}-{self.stage}"

    @property
    def table(self) -> str:
        return self.prefix

    @property
    def media_bucket(self) -> str:
        return f"{self.prefix}-media"

    @property
    def analytics_bucket(self) -> str:
        return f"{self.prefix}-analytics"

    @property
    def web_bucket(self) -> str:
        return f"{self.prefix}-web"

    @property
    def database(self) -> str:
        return self.prefix.replace("-", "_")

    @property
    def workgroup(self) -> str:
        return self.prefix

    @property
    def ecr_repository(self) -> str:
        return self.prefix

    @property
    def ecs_cluster(self) -> str:
        return self.prefix

    @property
    def ecs_task_definition(self) -> str:
        return f"{self.prefix}-analytics"

    @property
    def backend_security_group(self) -> str:
        return f"{self.prefix}-backend"

    @property
    def backend_instance(self) -> str:
        return f"{self.prefix}-backend"

    @property
    def backend_role(self) -> str:
        return f"{self.prefix}-ec2-backend"

    def queue(self, name: str) -> str:
        return f"{self.prefix}-{name}.fifo"

    def dlq(self, name: str) -> str:
        return f"{self.prefix}-{name}-dlq.fifo"


class Infrastructure:
    def __init__(self, stage: str, endpoint_url: str | None = None) -> None:
        self.stage = stage
        self.region = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "ap-southeast-2"))
        self.endpoint_url = endpoint_url
        self.session = boto3.Session(region_name=self.region)
        sts = self.aws("sts")
        account_id = sts.get_caller_identity()["Account"]
        self.names = Names(stage=stage, account_id=account_id)
        self.partition = "aws"

    def aws(self, service: str) -> Any:
        options: dict[str, Any] = {"region_name": self.region}
        if self.endpoint_url:
            options["endpoint_url"] = self.endpoint_url
        return self.session.client(service, **options)

    # ------------------------------------------------------------------ run
    def provision(
        self, *, build_worker: bool, build_backend: bool, web_dist: Path | None
    ) -> dict[str, Any]:
        roles = self.ensure_roles()
        self.ensure_buckets()
        self.ensure_table()
        queues = self.ensure_queues()
        self.ensure_media_notification()
        self.ensure_analytics_catalog()
        network = self.default_network()
        repository_uri = self.ensure_ecr()
        if build_worker:
            self.build_and_push_worker(repository_uri)
        task_definition = self.ensure_ecs(repository_uri, roles, network, queues)
        cognito = self.ensure_cognito()
        self.ensure_log_group()
        api_url = None
        ec2_backend: dict[str, str | None] | None = None
        if self._handler_modules_exist():
            if self.stage == "local":
                if build_backend:
                    self.build_and_push_backend(repository_uri)
                # Launch the EC2 backend against MiniStack so the EC2 resource,
                # security group, IAM instance profile, AMI lookup, and
                # idempotent reuse are exercised by the deploy workflow. MiniStack
                # emulates the instance (state=running) but cannot boot Docker, so
                # the real API continues to run via host uvicorn against MiniStack.
                ec2_backend = self.ensure_ec2_backend(repository_uri, roles, network, queues, cognito)
                api_url = "http://localhost:8000"
            else:
                if build_backend:
                    self.build_and_push_backend(repository_uri)
                ec2_backend = self.ensure_ec2_backend(repository_uri, roles, network, queues, cognito)
                api_url = ec2_backend["url"]
            # The SQS consumers (moderation/image/events) stay on Lambda for now.
            worker_functions = self.ensure_worker_lambdas(roles, network, queues)
            self.ensure_worker_mappings(worker_functions)
        distribution = self.ensure_cloudfront()
        if web_dist:
            self.upload_frontend(web_dist, distribution.get("id"))

        outputs = {
            "stage": self.stage,
            "region": self.region,
            "api_url": api_url,
            "web_url": distribution.get("url"),
            "web_bucket": self.names.web_bucket,
            "media_bucket": self.names.media_bucket,
            "analytics_bucket": self.names.analytics_bucket,
            "table_name": self.names.table,
            "queues": queues,
            "athena_database": self.names.database,
            "athena_workgroup": self.names.workgroup,
            "ecr_repository": repository_uri,
            "ecs_cluster": self.names.ecs_cluster,
            "ecs_task_definition": task_definition,
            "ec2_backend": ec2_backend,
            "cognito": cognito,
            "iam_roles": roles,
        }
        OUTPUT_PATH.parent.mkdir(exist_ok=True)
        OUTPUT_PATH.write_text(json.dumps(outputs, indent=2) + "\n")
        if self.stage == "local" and cognito.get("user_pool_id") and cognito.get("client_id"):
            local_env = OUTPUT_PATH.parent / "local.env"
            local_env.write_text(
                "\n".join(
                    [
                        f"COGNITO_USER_POOL_REGION={self.region}",
                        f"COGNITO_USER_POOL_ID={cognito['user_pool_id']}",
                        f"COGNITO_AUDIENCE={cognito['client_id']}",
                        f"COGNITO_ISSUER={cognito['issuer']}",
                        f"COGNITO_JWKS_URL={cognito['jwks_url']}",
                        "",
                    ]
                )
            )
        print(json.dumps(outputs, indent=2))
        return outputs

    # ------------------------------------------------------------------ IAM
    def ensure_role(self, name: str, principals: list[str], policy: dict[str, Any]) -> str:
        iam = self.aws("iam")
        trust = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"Service": principals},
                    "Action": "sts:AssumeRole",
                }
            ],
        }
        try:
            role = iam.get_role(RoleName=name)["Role"]
        except iam.exceptions.NoSuchEntityException:
            role = iam.create_role(
                RoleName=name,
                AssumeRolePolicyDocument=json.dumps(trust),
                Description=f"{PROJECT} {self.stage} application role",
                Tags=[{"Key": "Project", "Value": PROJECT}, {"Key": "Stage", "Value": self.stage}],
            )["Role"]
        iam.put_role_policy(
            RoleName=name,
            PolicyName=f"{name}-policy",
            PolicyDocument=json.dumps(policy),
        )
        return role["Arn"]

    def ensure_roles(self) -> dict[str, str]:
        table_arn = f"arn:{self.partition}:dynamodb:{self.region}:{self.names.account_id}:table/{self.names.table}"
        table_index_arn = f"{table_arn}/index/*"
        media_arn = f"arn:{self.partition}:s3:::{self.names.media_bucket}"
        analytics_arn = f"arn:{self.partition}:s3:::{self.names.analytics_bucket}"
        repository_arn = (
            f"arn:{self.partition}:ecr:{self.region}:{self.names.account_id}:"
            f"repository/{self.names.ecr_repository}"
        )
        common = [
            {
                "Effect": "Allow",
                "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
                "Resource": "*",
            },
            {
                "Effect": "Allow",
                "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Scan"],
                "Resource": [table_arn, table_index_arn],
            },
            {
                "Effect": "Allow",
                # HeadObject and CopyObject authorize through GetObject/PutObject;
                # s3:HeadObject and s3:CopyObject are not IAM actions.
                "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
                "Resource": [media_arn, f"{media_arn}/*", analytics_arn, f"{analytics_arn}/*"],
            },
            {
                "Effect": "Allow",
                "Action": ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"],
                "Resource": f"arn:{self.partition}:sqs:{self.region}:{self.names.account_id}:{self.names.prefix}-*",
            },
        ]
        task_role = self.ensure_role(
            f"{self.names.prefix}-ecs-task",
            ["ecs-tasks.amazonaws.com"],
            {"Version": "2012-10-17", "Statement": common},
        )
        execution_role = self.ensure_role(
            f"{self.names.prefix}-ecs-execution",
            ["ecs-tasks.amazonaws.com"],
            {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": [
                            "ecr:GetAuthorizationToken",
                            "ecr:BatchCheckLayerAvailability",
                            "ecr:GetDownloadUrlForLayer",
                            "ecr:BatchGetImage",
                            "logs:CreateLogStream",
                            "logs:PutLogEvents",
                        ],
                        "Resource": "*",
                    }
                ],
            },
        )
        app_policy = {
            "Version": "2012-10-17",
            "Statement": common
            + [
                {
                    "Effect": "Allow",
                    "Action": ["athena:StartQueryExecution", "athena:GetQueryExecution", "athena:GetQueryResults"],
                    "Resource": "*",
                },
                {"Effect": "Allow", "Action": ["glue:GetDatabase", "glue:GetTable", "glue:GetPartitions"], "Resource": "*"},
                {"Effect": "Allow", "Action": "ecs:RunTask", "Resource": "*"},
                {"Effect": "Allow", "Action": "iam:PassRole", "Resource": [task_role, execution_role]},
                {
                    "Effect": "Allow",
                    "Action": ["comprehend:DetectToxicContent"],
                    "Resource": "*",
                },
                {
                    "Effect": "Allow",
                    "Action": ["rekognition:DetectModerationLabels"],
                    "Resource": "*",
                },
            ],
        }
        # EC2 backend role (used through an instance profile) and Lambda roles
        # share the same application policy. ``trust`` differs per service.
        backend_policy = {
            "Version": "2012-10-17",
            "Statement": app_policy["Statement"]
            + [
                {
                    "Effect": "Allow",
                    "Action": "ecr:GetAuthorizationToken",
                    "Resource": "*",
                },
                {
                    "Effect": "Allow",
                    "Action": ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
                    "Resource": repository_arn,
                },
            ],
        }
        backend_role = self.ensure_role(
            self.names.backend_role,
            ["ec2.amazonaws.com"],
            backend_policy,
        )
        lambda_role = self.ensure_role(
            f"{self.names.prefix}-lambda",
            ["lambda.amazonaws.com"],
            app_policy,
        )
        if not self.endpoint_url:
            self.aws("iam").get_waiter("role_exists").wait(RoleName=f"{self.names.prefix}-lambda")
            self.aws("iam").get_waiter("role_exists").wait(RoleName=self.names.backend_role)
            time.sleep(5)
        return {"lambda": lambda_role, "task": task_role, "execution": execution_role, "ec2": backend_role}

    # ------------------------------------------------------------------ S3
    def ensure_buckets(self) -> None:
        s3 = self.aws("s3")
        for bucket in (self.names.media_bucket, self.names.analytics_bucket, self.names.web_bucket):
            try:
                s3.head_bucket(Bucket=bucket)
            except ClientError:
                request: dict[str, Any] = {"Bucket": bucket}
                if self.region != "us-east-1":
                    request["CreateBucketConfiguration"] = {"LocationConstraint": self.region}
                s3.create_bucket(**request)
            s3.put_public_access_block(
                Bucket=bucket,
                PublicAccessBlockConfiguration={
                    "BlockPublicAcls": True,
                    "IgnorePublicAcls": True,
                    "BlockPublicPolicy": True,
                    "RestrictPublicBuckets": True,
                },
            )
            s3.put_bucket_encryption(
                Bucket=bucket,
                ServerSideEncryptionConfiguration={
                    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
                },
            )
            s3.put_bucket_versioning(Bucket=bucket, VersioningConfiguration={"Status": "Enabled"})

    def ensure_media_notification(self) -> None:
        """Notify the image queue when an object lands in media/quarantine."""
        queues = self.aws("sqs")
        image_url = self.names.queue("image")
        image_arn = queues.get_queue_attributes(
            QueueUrl=image_url, AttributeNames=["QueueArn"]
        )["Attributes"]["QueueArn"]
        s3 = self.aws("s3")
        try:
            s3.get_bucket_notification_configuration(Bucket=self.names.media_bucket)
        except ClientError:
            pass
        try:
            s3.put_bucket_notification_configuration(
                Bucket=self.names.media_bucket,
                NotificationConfiguration={
                    "QueueConfigurations": [
                        {
                            "QueueArn": image_arn,
                            "Events": ["s3:ObjectCreated:*"],
                            "Filter": {"Key": {"FilterRules": [{"Name": "prefix", "Value": "quarantine/"}]}},
                        }
                    ]
                },
            )
        except ClientError as error:  # FIFO queue notifications are limited
            print(f"[warn] media notification skipped: {error_code(error)}")

    # -------------------------------------------------------------- DynamoDB
    def ensure_table(self) -> None:
        dynamodb = self.aws("dynamodb")
        try:
            dynamodb.describe_table(TableName=self.names.table)
            return
        except dynamodb.exceptions.ResourceNotFoundException:
            pass

        gsis = [
            {"IndexName": "gsi_handle", "KeySchema": [{"AttributeName": "gsi_handle_pk", "KeyType": "HASH"}, {"AttributeName": "gsi_handle_sk", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
            {"IndexName": "gsi_slug", "KeySchema": [{"AttributeName": "gsi_slug_pk", "KeyType": "HASH"}, {"AttributeName": "gsi_slug_sk", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
            {"IndexName": "gsi_user_society", "KeySchema": [{"AttributeName": "gsi_user_society_pk", "KeyType": "HASH"}, {"AttributeName": "gsi_user_society_sk", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
            {"IndexName": "gsi_content", "KeySchema": [{"AttributeName": "gsi_content_pk", "KeyType": "HASH"}, {"AttributeName": "gsi_content_sk", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
            {"IndexName": "gsi_society_pin", "KeySchema": [{"AttributeName": "gsi_society_pin_pk", "KeyType": "HASH"}], "Projection": {"ProjectionType": "ALL"}},
            {"IndexName": "gsi_report", "KeySchema": [{"AttributeName": "gsi_report_pk", "KeyType": "HASH"}, {"AttributeName": "gsi_report_sk", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
            {"IndexName": "gsi_modqueue", "KeySchema": [{"AttributeName": "gsi_mod_pk", "KeyType": "HASH"}, {"AttributeName": "gsi_mod_sk", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
            {"IndexName": "gsi_appeal", "KeySchema": [{"AttributeName": "gsi_appeal_pk", "KeyType": "HASH"}, {"AttributeName": "gsi_appeal_sk", "KeyType": "RANGE"}], "Projection": {"ProjectionType": "ALL"}},
        ]
        attribute_definitions = [
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
            {"AttributeName": "gsi_handle_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_handle_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_slug_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_slug_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_user_society_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_user_society_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_content_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_content_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_society_pin_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_report_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_report_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_mod_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_mod_sk", "AttributeType": "S"},
            {"AttributeName": "gsi_appeal_pk", "AttributeType": "S"},
            {"AttributeName": "gsi_appeal_sk", "AttributeType": "S"},
        ]
        table = dynamodb.create_table(
            TableName=self.names.table,
            AttributeDefinitions=attribute_definitions,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            GlobalSecondaryIndexes=gsis,
            BillingMode="PAY_PER_REQUEST",
            SSESpecification={"Enabled": True},
            Tags=[{"Key": "Project", "Value": PROJECT}, {"Key": "Stage", "Value": self.stage}],
        )
        if not self.endpoint_url:
            dynamodb.get_waiter("table_exists").wait(TableName=self.names.table)
        # Enable TTL on the optional ttl attribute (idempotency / feed entries).
        try:
            dynamodb.update_time_to_live(
                TableName=self.names.table,
                TimeToLiveSpecification={"Enabled": True, "AttributeName": "ttl"},
            )
        except ClientError:
            pass
        if self.endpoint_url:
            # MiniStack/DynamoDB Local may create the table asynchronously; poll briefly.
            for _ in range(20):
                try:
                    dynamodb.describe_table(TableName=self.names.table)
                    break
                except dynamodb.exceptions.ResourceNotFoundException:
                    time.sleep(1)
        print(f"Created table {self.names.table} (indexes: {len(gsis)})")

    # ------------------------------------------------------------------ SQS
    def ensure_queues(self) -> dict[str, str]:
        sqs = self.aws("sqs")
        result: dict[str, str] = {}
        for name in ("moderation", "image", "events"):
            dlq = self.names.dlq(name)
            dlq_url = self._ensure_queue(sqs, dlq)
            main_url = self._ensure_queue(sqs, self.names.queue(name), dlq_arn=self._queue_arn(sqs, dlq_url))
            result[name] = main_url
            result[f"{name}_dlq"] = dlq_url
        return result

    def _queue_arn(self, sqs: Any, url: str) -> str:
        return sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]

    def _ensure_queue(self, sqs: Any, name: str, *, dlq_arn: str | None = None) -> str:
        attributes: dict[str, str] = {
            "FifoQueue": "true",
            "ContentBasedDeduplication": "true",
            "VisibilityTimeout": "30",
            "DelaySeconds": "0",
        }
        if dlq_arn:
            attributes["RedrivePolicy"] = json.dumps(
                {"deadLetterTargetArn": dlq_arn, "maxReceiveCount": "5"}
            )
        try:
            return sqs.get_queue_url(QueueName=name)["QueueUrl"]
        except ClientError:
            return sqs.create_queue(QueueName=name, Attributes=attributes, tags={"Project": PROJECT, "Stage": self.stage})["QueueUrl"]

    # --------------------------------------------------- Glue / Athena
    def ensure_analytics_catalog(self) -> None:
        glue = self.aws("glue")
        try:
            glue.get_database(Name=self.names.database)
        except glue.exceptions.EntityNotFoundException:
            glue.create_database(DatabaseInput={"Name": self.names.database, "Description": "RMIT Society sanitized analytics catalog"})
        table_input = {
            "Name": "forum_events",
            "TableType": "EXTERNAL_TABLE",
            "Parameters": {"classification": "json", "EXTERNAL": "TRUE"},
            "StorageDescriptor": {
                "Columns": [
                    {"Name": "event", "Type": "string"},
                    {"Name": "action", "Type": "string"},
                    {"Name": "type", "Type": "string"},
                    {"Name": "version", "Type": "int"},
                ],
                "Location": f"s3://{self.names.analytics_bucket}/forum-events/",
                "InputFormat": "org.apache.hadoop.mapred.TextInputFormat",
                "OutputFormat": "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
                "SerdeInfo": {"SerializationLibrary": "org.openx.data.jsonserde.JsonSerDe"},
            },
            "PartitionKeys": [{"Name": "date", "Type": "string"}],
        }
        try:
            glue.get_table(DatabaseName=self.names.database, Name="forum_events")
            glue.update_table(DatabaseName=self.names.database, TableInput=table_input)
        except glue.exceptions.EntityNotFoundException:
            glue.create_table(DatabaseName=self.names.database, TableInput=table_input)
        athena = self.aws("athena")
        try:
            athena.get_work_group(WorkGroup=self.names.workgroup)
        except ClientError as error:
            if error_code(error) not in {"InvalidRequestException", "ResourceNotFoundException"}:
                raise
            athena.create_work_group(
                Name=self.names.workgroup,
                Description="RMIT Society application queries",
                Configuration={
                    "ResultConfiguration": {"OutputLocation": f"s3://{self.names.analytics_bucket}/athena-results/"},
                    "EnforceWorkGroupConfiguration": True,
                    "PublishCloudWatchMetricsEnabled": True,
                },
                Tags=[{"Key": "Project", "Value": PROJECT}, {"Key": "Stage", "Value": self.stage}],
            )

    # ------------------------------------------------------------- network
    def default_network(self) -> dict[str, list[str]]:
        ec2 = self.aws("ec2")
        vpcs = ec2.describe_vpcs(Filters=[{"Name": "is-default", "Values": ["true"]}])["Vpcs"]
        if not vpcs:
            raise RuntimeError("Default VPC required for ECS Fargate; configure one before deployment")
        vpc_id = vpcs[0]["VpcId"]
        subnets = ec2.describe_subnets(Filters=[{"Name": "vpc-id", "Values": [vpc_id]}])["Subnets"]
        groups = ec2.describe_security_groups(
            Filters=[{"Name": "vpc-id", "Values": [vpc_id]}, {"Name": "group-name", "Values": ["default"]}]
        )["SecurityGroups"]
        return {
            "vpc_id": vpc_id,
            "subnets": [subnet["SubnetId"] for subnet in subnets],
            "security_groups": [group["GroupId"] for group in groups],
        }

    # ------------------------------------------------------------- ECR/ECS
    def ensure_ecr(self) -> str:
        ecr = self.aws("ecr")
        try:
            return ecr.describe_repositories(repositoryNames=[self.names.ecr_repository])["repositories"][0]["repositoryUri"]
        except ecr.exceptions.RepositoryNotFoundException:
            return ecr.create_repository(
                repositoryName=self.names.ecr_repository,
                imageScanningConfiguration={"scanOnPush": True},
                imageTagMutability="MUTABLE",
                tags=[{"Key": "Project", "Value": PROJECT}, {"Key": "Stage", "Value": self.stage}],
            )["repository"]["repositoryUri"]

    def build_and_push_worker(self, repository_uri: str) -> None:
        raise NotImplementedError(
            "ECS analytics worker image not implemented: backend workers/ has no runnable entrypoint yet."
        )

    def build_and_push_backend(self, repository_uri: str) -> None:
        """Build ``backend/Dockerfile`` and push it to ECR.

        Requires a local Docker daemon. The resulting image runs the unified
        FastAPI server and is pulled by the EC2 backend instance on boot.
        """
        ecr = self.aws("ecr")
        auth = ecr.get_authorization_token()["authorizationData"][0]
        username, password = base64.b64decode(auth["authorizationToken"]).decode().split(":", 1)
        registry = auth["proxyEndpoint"]
        tag = f"{repository_uri}:latest"
        subprocess.run(["docker", "login", "-u", username, "-p", password, registry], check=True)
        subprocess.run(["docker", "build", "-t", tag, str(ROOT / "backend")], check=True)
        subprocess.run(["docker", "push", tag], check=True)

    def _latest_al2023_ami(self) -> str:
        names = self.aws("ec2")
        images = names.describe_images(
            Owners=["amazon"],
            Filters=[
                {"Name": "name", "Values": ["al2023-ami-2023.*-x86_64"]},
                {"Name": "state", "Values": ["available"]},
            ],
        )["Images"]
        # MiniStack ignores owner/filter args and returns its preloaded images,
        # so fall back to the broader listing when AWS returns nothing matching.
        if not images:
            images = names.describe_images()["Images"]
        if not images:
            raise RuntimeError("No Amazon Linux 2023 x86_64 AMI found")
        images.sort(key=lambda image: image.get("CreationDate") or "", reverse=True)
        return images[0]["ImageId"]

    def ensure_ec2_backend(
        self,
        repository_uri: str,
        roles: dict[str, str],
        network: dict[str, list[str] | str],
        queues: dict[str, str],
        cognito: dict[str, str | None] | None = None,
    ) -> dict[str, str | None]:
        """Launch (or reuse) the EC2 backend that runs the FastAPI server.

        The instance runs a user-data script that installs Docker, authenticates
        against ECR with the instance profile, and runs the backend image on
        port 8000. Idempotent: a running tagged instance is reused.
        """
        ec2 = self.aws("ec2")
        vpc_id = str(network["vpc_id"])
        # Security group for the backend API.
        sgs = ec2.describe_security_groups(
            Filters=[
                {"Name": "group-name", "Values": [self.names.backend_security_group]},
                {"Name": "vpc-id", "Values": [vpc_id]},
            ]
        )["SecurityGroups"]
        if sgs:
            sg_id = sgs[0]["GroupId"]
        else:
            sg_id = ec2.create_security_group(
                GroupName=self.names.backend_security_group,
                Description="RMIT Society backend API",
                VpcId=vpc_id,
                TagSpecifications=[
                    {
                        "ResourceType": "security-group",
                        "Tags": [
                            {"Key": "Project", "Value": PROJECT},
                            {"Key": "Stage", "Value": self.stage},
                        ],
                    }
                ],
            )["GroupId"]
        try:
            ec2.authorize_security_group_ingress(
                GroupId=sg_id,
                IpPermissions=[
                    {
                        "IpProtocol": "tcp",
                        "FromPort": 8000,
                        "ToPort": 8000,
                        "IpRanges": [{"CidrIp": "0.0.0.0/0"}],
                    }
                ],
            )
        except ClientError as error:
            if error_code(error) != "InvalidPermission.Duplicate":
                raise
        # Instance profile wrapping the EC2 backend role.
        iam = self.aws("iam")
        profile_name = self.names.backend_role
        try:
            iam.get_instance_profile(InstanceProfileName=profile_name)
        except iam.exceptions.NoSuchEntityException:
            iam.create_instance_profile(
                InstanceProfileName=profile_name,
                Tags=[{"Key": "Project", "Value": PROJECT}, {"Key": "Stage", "Value": self.stage}],
            )
        try:
            iam.add_role_to_instance_profile(
                InstanceProfileName=profile_name, RoleName=self.names.backend_role
            )
        except iam.exceptions.LimitExceededException:
            pass  # role already attached
        # Reuse an existing running instance, otherwise launch a new one.
        found = ec2.describe_instances(
            Filters=[{"Name": "tag:Name", "Values": [self.names.backend_instance]}]
        )
        instances = [
            instance
            for reservation in found.get("Reservations", [])
            for instance in reservation.get("Instances", [])
            if instance.get("State", {}).get("Name") in {"running", "pending"}
        ]
        if not instances:
            image_id = self._latest_al2023_ami()
            environment = self.app_environment(
                {k: network[k] for k in ("subnets", "security_groups")}, queues, cognito
            )
            environment.append({"name": "AWS_REGION", "value": self.region})
            env_args = " ".join(f"-e {item['name']}={item['value']}" for item in environment)
            registry_domain = repository_uri.split("/", 1)[0]
            user_data = f"""#!/bin/bash
set -euxo pipefail
dnf install -y docker
systemctl enable --now docker
aws ecr get-login-password --region {self.region} | docker login --username AWS --password-stdin {registry_domain}
docker pull {repository_uri}:latest
docker rm -f rmit-backend || true
docker run -d --name rmit-backend --restart unless-stopped -p 8000:8000 {env_args} {repository_uri}:latest
"""
            response = ec2.run_instances(
                ImageId=image_id,
                InstanceType="t3.micro",
                MinCount=1,
                MaxCount=1,
                SubnetId=str(network["subnets"][0]),
                SecurityGroupIds=[sg_id],
                IamInstanceProfile={"Name": profile_name},
                UserData=base64.b64encode(user_data.encode()).decode(),
                TagSpecifications=[
                    {
                        "ResourceType": "instance",
                        "Tags": [
                            {"Key": "Name", "Value": self.names.backend_instance},
                            {"Key": "Project", "Value": PROJECT},
                            {"Key": "Stage", "Value": self.stage},
                        ],
                    }
                ],
            )
            instance_id = response["Instances"][0]["InstanceId"]
            ec2.get_waiter("instance_running").wait(InstanceIds=[instance_id])
        else:
            instance_id = instances[0]["InstanceId"]
        public_ip = None
        for attempt in range(1 if self.stage == "local" else 60):
            detail = ec2.describe_instances(InstanceIds=[instance_id])
            instance = detail["Reservations"][0]["Instances"][0]
            public_ip = instance.get("PublicIpAddress")
            if public_ip:
                break
            # MiniStack emulates instances as running but never assigns a
            # public IP or DNS name; don't burn the retry loop in local.
            if self.stage == "local":
                break
            time.sleep(5)
        if not public_ip and self.stage != "local":
            raise RuntimeError(f"EC2 backend {instance_id} never received a public IP")
        return {
            "instance_id": instance_id,
            "public_ip": public_ip,
            "dns": instance.get("PublicDnsName"),
            "security_group_id": sg_id,
            "url": f"http://{public_ip}:8000" if public_ip else None,
        }

    def app_environment(
        self,
        network: dict[str, list[str]],
        queues: dict[str, str],
        cognito: dict[str, str | None] | None = None,
    ) -> list[dict[str, str]]:
        # Note: AWS_REGION is intentionally omitted from user-set env vars.
        # Lambda treats it as a reserved key and rejects it (InvalidParameterValue).
        # The runtime auto-injects AWS_REGION and backend Settings reads it
        # (aws_region) from the process env, so it is available at runtime.
        values = {
            "ENVIRONMENT": self.stage,
            "TABLE_NAME": self.names.table,
            "MEDIA_BUCKET": self.names.media_bucket,
            "ANALYTICS_BUCKET": self.names.analytics_bucket,
            "MODERATION_QUEUE_URL": queues["moderation"],
            "IMAGE_QUEUE_URL": queues["image"],
            "EVENT_QUEUE_URL": queues["events"],
            "ATHENA_DATABASE": self.names.database,
            "ATHENA_WORKGROUP": self.names.workgroup,
            "ECS_CLUSTER": self.names.ecs_cluster,
            "ECS_TASK_DEFINITION": self.names.ecs_task_definition,
            "ECS_SUBNET_IDS": ",".join(network["subnets"]),
            "ECS_SECURITY_GROUP_IDS": ",".join(network["security_groups"]),
            "CORS_ORIGINS": os.getenv("CORS_ORIGINS", "http://localhost:5173"),
            "MODERATION_PROVIDER": "local" if self.stage == "local" else "aws",
            "IMAGE_PROVIDER": "local" if self.stage == "local" else "aws",
        }
        if self.endpoint_url:
            values["AWS_ENDPOINT_URL"] = os.getenv(
                "AWS_INTERNAL_ENDPOINT_URL",
                "http://ministack:4566" if self.stage == "local" else self.endpoint_url,
            )
        if cognito and cognito.get("user_pool_id") and cognito.get("client_id"):
            pool_id = str(cognito["user_pool_id"])
            if self.endpoint_url:
                jwks_endpoint = os.getenv(
                    "AWS_INTERNAL_ENDPOINT_URL",
                    "http://ministack:4566" if self.stage == "local" else self.endpoint_url,
                ).rstrip("/")
                jwks_url = f"{jwks_endpoint}/{pool_id}/.well-known/jwks.json"
            else:
                jwks_url = str(cognito["jwks_url"])
            values.update(
                {
                    "COGNITO_USER_POOL_ID": pool_id,
                    "COGNITO_AUDIENCE": str(cognito["client_id"]),
                    "COGNITO_ISSUER": str(cognito["issuer"]),
                    "COGNITO_JWKS_URL": jwks_url,
                }
            )
        return [{"name": key, "value": value} for key, value in values.items()]

    def ensure_ecs(
        self, repository_uri: str, roles: dict[str, str], network: dict[str, list[str]], queues: dict[str, str]
    ) -> str:
        ecs = self.aws("ecs")
        clusters = ecs.describe_clusters(clusters=[self.names.ecs_cluster])["clusters"]
        if not clusters or clusters[0].get("status") == "INACTIVE":
            ecs.create_cluster(
                clusterName=self.names.ecs_cluster,
                capacityProviders=["FARGATE"],
                tags=[{"key": "Project", "value": PROJECT}, {"key": "Stage", "value": self.stage}],
            )
        self.ensure_log_group()
        response = ecs.register_task_definition(
            family=self.names.ecs_task_definition,
            taskRoleArn=roles["task"],
            executionRoleArn=roles["execution"],
            networkMode="awsvpc",
            requiresCompatibilities=["FARGATE"],
            cpu="256",
            memory="512",
            runtimePlatform={"cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX"},
            containerDefinitions=[
                {
                    "name": "analytics",
                    "image": f"{repository_uri}:latest",
                    "essential": True,
                    "environment": self.app_environment(network, queues),
                    "logConfiguration": {
                        "logDriver": "awslogs",
                        "options": {
                            "awslogs-group": self.log_group_name(),
                            "awslogs-region": self.region,
                            "awslogs-stream-prefix": "worker",
                        },
                    },
                }
            ],
            tags=[{"key": "Project", "value": PROJECT}, {"key": "Stage", "value": self.stage}],
        )
        return response["taskDefinition"]["taskDefinitionArn"]

    def log_group_name(self) -> str:
        return f"/ecs/{self.names.ecs_cluster}"

    def ensure_log_group(self) -> None:
        logs = self.aws("logs")
        try:
            logs.create_log_group(logGroupName=self.log_group_name())
        except logs.exceptions.ResourceAlreadyExistsException:
            pass
        try:
            logs.put_retention_policy(logGroupName=self.log_group_name(), retentionInDays=14)
        except ClientError:
            pass

    # ------------------------------------------------------------- Cognito
    def ensure_cognito(self) -> dict[str, str | None]:
        """Reconcile Cognito pool/client and return verifier configuration."""
        client_idp = self.aws("cognito-idp")
        pool_name = f"{self.names.prefix}-users"
        pool_id: str | None = None
        try:
            pools = client_idp.list_user_pools(MaxResults=60).get("UserPools", [])
            existing = next((p for p in pools if p["Name"] == pool_name), None)
            if existing:
                pool_id = existing["Id"]
            else:
                pool_id = client_idp.create_user_pool(
                    PoolName=pool_name,
                    Policies={
                        "PasswordPolicy": {
                            "MinimumLength": 8,
                            "RequireUppercase": True,
                            "RequireLowercase": True,
                            "RequireNumbers": True,
                            "RequireSymbols": True,
                        }
                    },
                    AutoVerifiedAttributes=["email"],
                    Schema=[
                        {"Name": "email", "Required": True, "Mutable": True},
                        {"Name": "preferred_username", "Required": False},
                    ],
                    AdminCreateUserConfig={"AllowAdminCreateUserOnly": False},
                    UsernameAttributes=["email"],
                    VerificationMessageTemplate={"DefaultEmailOption": "CONFIRM_WITH_CODE"},
                    UserPoolTags={"Project": PROJECT, "Stage": self.stage},
                )["UserPool"]["Id"]
        except ClientError as error:
            print(f"[warn] Cognito user pool not emulated: {error_code(error)}")
            return {"user_pool_id": None, "client_id": None}

        client_id: str | None = None
        try:
            clients = client_idp.list_user_pool_clients(UserPoolId=pool_id, MaxResults=60).get("UserPoolClients", [])
            client_name = f"{self.names.prefix}-spa"
            existing = next((c for c in clients if c["ClientName"] == client_name), None)
            if existing:
                client_id = existing["ClientId"]
            else:
                client_id = client_idp.create_user_pool_client(
                    UserPoolId=pool_id,
                    ClientName=client_name,
                    GenerateSecret=False,
                    ExplicitAuthFlows=["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_PASSWORD_AUTH"],
                    AllowedOAuthFlows=["code"],
                    AllowedOAuthScopes=["openid", "email", "profile"],
                    CallbackURLs=["http://localhost:5173"],
                    LogoutURLs=["http://localhost:5173"],
                    SupportedIdentityProviders=["COGNITO"],
                )["UserPoolClient"]["ClientId"]
        except ClientError as error:
            print(f"[warn] Cognito SPA client not emulated: {error_code(error)}")
            return {"user_pool_id": pool_id, "client_id": None}
        issuer = f"https://cognito-idp.{self.region}.amazonaws.com/{pool_id}"
        jwks_endpoint = self.endpoint_url.rstrip("/") if self.endpoint_url else issuer
        return {
            "user_pool_id": pool_id,
            "client_id": client_id,
            "issuer": issuer,
            "jwks_url": f"{jwks_endpoint}/{pool_id}/.well-known/jwks.json",
        }

    # --------------------------------------------------- Lambda / API / CDN
    def _handler_modules_exist(self) -> bool:
        handlers = ROOT / "backend" / "src" / "rmit_society" / "handlers"
        return any(handlers.glob("*.py")) if handlers.exists() else False

    def _load_lambda_code(self) -> bytes:
        # Always rebuild: a stale or wrong-arch archive (whose pydantic_core
        # lacks a loadable native _pydantic_core.so) would otherwise be
        # re-uploaded and fail at import with Runtime.ImportModuleError.
        # package_lambda validates the ABI, and the target arch follows the
        # executing runtime (host for local, x86_64 for dev/prod).
        archive = package_lambda(_lambda_platform(self.stage))
        return archive.read_bytes()

    def ensure_worker_lambdas(
        self,
        roles: dict[str, str],
        network: dict[str, list[str]],
        queues: dict[str, str],
    ) -> dict[str, str]:
        """Create the SQS consumer Lambda functions.

        These remain on Lambda for now (the moderation/image/event consumers);
        they may be migrated to the EC2 backend container later. The API was
        moved to EC2 and is therefore not provisioned here.
        """
        lambdas = self.aws("lambda")
        code = self._load_lambda_code()
        environment = {item["name"]: item["value"] for item in self.app_environment(network, queues)}
        worker_handlers = {
            "moderation": "rmit_society.workers.lambda_handlers.moderation_handler",
            "image": "rmit_society.workers.lambda_handlers.image_handler",
            "events": "rmit_society.workers.lambda_handlers.event_handler",
        }
        functions: dict[str, str] = {}
        for suffix, handler in worker_handlers.items():
            name = f"{self.names.prefix}-worker-{suffix}"
            functions[f"worker-{suffix}"] = self._upsert_lambda(
                lambdas, name, handler, code, roles["lambda"], environment
            )
        return functions

    def _upsert_lambda(
        self, lambdas: Any, name: str, handler: str, code: bytes, role_arn: str, environment: dict[str, str]
    ) -> str:
        try:
            current = lambdas.get_function(FunctionName=name)
            lambdas.update_function_code(FunctionName=name, ZipFile=code, Publish=True)
            if not self.endpoint_url:
                lambdas.get_waiter("function_updated_v2").wait(FunctionName=name)
            lambdas.update_function_configuration(
                FunctionName=name,
                Role=role_arn,
                Handler=handler,
                Runtime="python3.12",
                Timeout=120,
                MemorySize=512,
                Environment={"Variables": environment},
            )
            return current["Configuration"]["FunctionArn"]
        except lambdas.exceptions.ResourceNotFoundException:
            response = lambdas.create_function(
                FunctionName=name,
                Runtime="python3.12",
                Role=role_arn,
                Handler=handler,
                Code={"ZipFile": code},
                Timeout=120,
                MemorySize=512,
                Publish=True,
                Environment={"Variables": environment},
                Architectures=[_lambda_arch(self.stage)],
                Tags={"Project": PROJECT, "Stage": self.stage},
            )
            return response["FunctionArn"]

    def ensure_worker_mappings(self, functions: dict[str, str]) -> None:
        """Wire SQS event-source mappings so SQS messages drive the workers."""
        sqs = self.aws("sqs")
        lambdas = self.aws("lambda")
        mapping = {
            "worker-moderation": (
                functions.get("worker-moderation"),
                self._queue_arn(sqs, self.names.queue("moderation")),
            ),
            "worker-image": (
                functions.get("worker-image"),
                self._queue_arn(sqs, self.names.queue("image")),
            ),
            "worker-events": (
                functions.get("worker-events"),
                self._queue_arn(sqs, self.names.queue("events")),
            ),
        }
        for fn_arn, queue_arn in mapping.values():
            if not fn_arn:
                continue
            function_name = fn_arn.rsplit(":", 1)[-1]
            existing = lambdas.list_event_source_mappings(FunctionName=function_name).get("EventSourceMappings", [])
            if not any(m.get("EventSourceArn") == queue_arn for m in existing):
                try:
                    lambdas.create_event_source_mapping(
                        FunctionName=function_name,
                        EventSourceArn=queue_arn,
                        BatchSize=1,
                        MaximumBatchingWindowInSeconds=0,
                        Enabled=True,
                    )
                except ClientError as error:
                    print(f"[warn] event-source mapping for {function_name}: {error_code(error)}")

    def ensure_cloudfront(self) -> dict[str, str | None]:
        if self.endpoint_url:
            return {"id": None, "url": f"s3://{self.names.web_bucket}"}
        raise NotImplementedError("CloudFront provisioning deferred until SPA build is wired.")

    def upload_frontend(self, directory: Path, distribution_id: str | None) -> None:
        if not directory.is_dir():
            raise FileNotFoundError(f"Frontend distribution does not exist: {directory}")
        s3 = self.aws("s3")
        for path in directory.rglob("*"):
            if not path.is_file():
                continue
            key = path.relative_to(directory).as_posix()
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            cache_control = "no-cache" if key == "index.html" else "public,max-age=31536000,immutable"
            s3.upload_file(
                str(path),
                self.names.web_bucket,
                key,
                ExtraArgs={"ContentType": content_type, "CacheControl": cache_control},
            )
        if distribution_id and not self.endpoint_url:
            self.aws("cloudfront").create_invalidation(
                DistributionId=distribution_id,
                InvalidationBatch={
                    "Paths": {"Quantity": 1, "Items": ["/*"]},
                    "CallerReference": f"deploy-{int(time.time())}",
                },
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Provision RMIT Society AWS infrastructure with boto3")
    parser.add_argument("--stage", default="local", choices=["local", "dev", "prod"])
    parser.add_argument("--endpoint-url", default=os.getenv("AWS_ENDPOINT_URL"))
    parser.add_argument(
        "--no-local-endpoint-default",
        action="store_true",
        help="Disable the MiniStack endpoint default for the local stage",
    )
    parser.add_argument("--build-worker", action="store_true", help="Build and push ECS image (unsupported until worker exists)")
    parser.add_argument("--build-backend", action="store_true", help="Build and push the EC2 backend Docker image to ECR")
    parser.add_argument("--web-dist", type=Path, help="Upload built frontend directory")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    # Safety guard: the local stage must target MiniStack, never real AWS.
    # A bare `--stage local` (or a missing AWS_ENDPOINT_URL) otherwise routes
    # boto3 at the live account via the default credential chain.
    if (
        args.stage == "local"
        and not args.endpoint_url
        and not args.no_local_endpoint_default
    ):
        args.endpoint_url = "http://localhost:4566"
        print("[info] local stage defaults to MiniStack at http://localhost:4566")
    infrastructure = Infrastructure(args.stage, args.endpoint_url)
    infrastructure.provision(
        build_worker=args.build_worker, build_backend=args.build_backend, web_dist=args.web_dist
    )


if __name__ == "__main__":
    main()
