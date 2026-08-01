#!/usr/bin/env python3
"""Idempotent boto3 infrastructure provisioning for CloudPulse.

No CloudFormation/CDK is used: this script directly declares and reconciles AWS resources.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import boto3
from botocore.exceptions import ClientError

from package_lambda import package_lambda

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / ".cloudpulse" / "outputs.json"
PROJECT = "cloudpulse"


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
    def data_bucket(self) -> str:
        return f"{self.prefix}-{self.account_id}-data"

    @property
    def web_bucket(self) -> str:
        return f"{self.prefix}-{self.account_id}-web"

    @property
    def database(self) -> str:
        return self.prefix.replace("-", "_")


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

    def provision(self, *, build_worker: bool, web_dist: Path | None) -> dict[str, Any]:
        self.ensure_buckets()
        self.ensure_table()
        network = self.default_network()
        roles = self.ensure_roles()
        repository_uri = self.ensure_ecr()
        if build_worker:
            self.build_and_push_worker(repository_uri)
        task_definition = self.ensure_ecs(repository_uri, roles, network)
        self.ensure_analytics_catalog()
        functions = self.ensure_lambdas(roles["lambda"], task_definition, network)
        api_url = self.ensure_api(functions)
        distribution = self.ensure_cloudfront()
        if web_dist:
            self.upload_frontend(web_dist, distribution.get("id"))
        self.seed_location()

        outputs = {
            "stage": self.stage,
            "region": self.region,
            "api_url": api_url,
            "web_url": distribution.get("url"),
            "web_bucket": self.names.web_bucket,
            "data_bucket": self.names.data_bucket,
            "table_name": self.names.table,
            "athena_database": self.names.database,
            "athena_workgroup": self.names.prefix,
            "ecr_repository": repository_uri,
            "ecs_cluster": self.names.prefix,
            "ecs_task_definition": task_definition,
            "lambda_functions": functions,
        }
        OUTPUT_PATH.parent.mkdir(exist_ok=True)
        OUTPUT_PATH.write_text(json.dumps(outputs, indent=2) + "\n")
        print(json.dumps(outputs, indent=2))
        return outputs

    def ensure_buckets(self) -> None:
        s3 = self.aws("s3")
        for bucket in (self.names.data_bucket, self.names.web_bucket):
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
        s3.put_bucket_cors(
            Bucket=self.names.data_bucket,
            CORSConfiguration={
                "CORSRules": [
                    {
                        "AllowedMethods": ["GET"],
                        "AllowedOrigins": ["*"],
                        "AllowedHeaders": ["*"],
                        "MaxAgeSeconds": 3600,
                    }
                ]
            },
        )

    def ensure_table(self) -> None:
        dynamodb = self.aws("dynamodb")
        try:
            dynamodb.describe_table(TableName=self.names.table)
        except dynamodb.exceptions.ResourceNotFoundException:
            dynamodb.create_table(
                TableName=self.names.table,
                AttributeDefinitions=[
                    {"AttributeName": "PK", "AttributeType": "S"},
                    {"AttributeName": "SK", "AttributeType": "S"},
                ],
                KeySchema=[
                    {"AttributeName": "PK", "KeyType": "HASH"},
                    {"AttributeName": "SK", "KeyType": "RANGE"},
                ],
                BillingMode="PAY_PER_REQUEST",
                SSESpecification={"Enabled": True},
                Tags=[{"Key": "Project", "Value": PROJECT}, {"Key": "Stage", "Value": self.stage}],
            )
            if not self.endpoint_url:
                dynamodb.get_waiter("table_exists").wait(TableName=self.names.table)

    def default_network(self) -> dict[str, list[str]]:
        ec2 = self.aws("ec2")
        vpcs = ec2.describe_vpcs(Filters=[{"Name": "is-default", "Values": ["true"]}])["Vpcs"]
        if not vpcs:
            raise RuntimeError("Default VPC required for ECS Fargate; configure one before deployment")
        vpc_id = vpcs[0]["VpcId"]
        subnets = ec2.describe_subnets(Filters=[{"Name": "vpc-id", "Values": [vpc_id]}])["Subnets"]
        groups = ec2.describe_security_groups(
            Filters=[
                {"Name": "vpc-id", "Values": [vpc_id]},
                {"Name": "group-name", "Values": ["default"]},
            ]
        )["SecurityGroups"]
        return {
            "subnets": [subnet["SubnetId"] for subnet in subnets],
            "security_groups": [group["GroupId"] for group in groups],
        }

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
                Description=f"CloudPulse {self.stage} application role",
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
        data_arn = f"arn:{self.partition}:s3:::{self.names.data_bucket}"
        common = [
            {
                "Effect": "Allow",
                "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
                "Resource": "*",
            },
            {
                "Effect": "Allow",
                "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:Scan"],
                "Resource": table_arn,
            },
            {
                "Effect": "Allow",
                "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
                "Resource": [data_arn, f"{data_arn}/*"],
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
        lambda_policy = {
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
            ],
        }
        lambda_role = self.ensure_role(
            f"{self.names.prefix}-lambda",
            ["lambda.amazonaws.com"],
            lambda_policy,
        )
        if not self.endpoint_url:
            self.aws("iam").get_waiter("role_exists").wait(RoleName=f"{self.names.prefix}-lambda")
            time.sleep(5)
        return {"lambda": lambda_role, "task": task_role, "execution": execution_role}

    def ensure_ecr(self) -> str:
        ecr = self.aws("ecr")
        try:
            return ecr.describe_repositories(repositoryNames=[self.names.prefix])["repositories"][0]["repositoryUri"]
        except ecr.exceptions.RepositoryNotFoundException:
            return ecr.create_repository(
                repositoryName=self.names.prefix,
                imageScanningConfiguration={"scanOnPush": True},
                imageTagMutability="MUTABLE",
                tags=[{"Key": "Project", "Value": PROJECT}, {"Key": "Stage", "Value": self.stage}],
            )["repository"]["repositoryUri"]

    def build_and_push_worker(self, repository_uri: str) -> None:
        ecr = self.aws("ecr")
        auth = ecr.get_authorization_token()["authorizationData"][0]
        username, password = base64.b64decode(auth["authorizationToken"]).decode().split(":", 1)
        registry = repository_uri.split("/", 1)[0]
        subprocess.run(
            ["docker", "login", "--username", username, "--password-stdin", registry],
            input=password,
            text=True,
            check=True,
        )
        image = f"{repository_uri}:latest"
        subprocess.run(
            ["docker", "build", "--platform", "linux/amd64", "-f", "backend/Dockerfile.worker", "-t", image, "backend"],
            cwd=ROOT,
            check=True,
        )
        subprocess.run(["docker", "push", image], check=True)

    def ensure_ecs(
        self,
        repository_uri: str,
        roles: dict[str, str],
        network: dict[str, list[str]],
    ) -> str:
        ecs = self.aws("ecs")
        clusters = ecs.describe_clusters(clusters=[self.names.prefix])["clusters"]
        if not clusters or clusters[0].get("status") == "INACTIVE":
            ecs.create_cluster(
                clusterName=self.names.prefix,
                capacityProviders=["FARGATE"],
                tags=[{"key": "Project", "value": PROJECT}, {"key": "Stage", "value": self.stage}],
            )
        logs = self.aws("logs")
        log_group = f"/ecs/{self.names.prefix}"
        try:
            logs.create_log_group(logGroupName=log_group)
        except logs.exceptions.ResourceAlreadyExistsException:
            pass
        response = ecs.register_task_definition(
            family=f"{self.names.prefix}-analytics",
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
                    "environment": self.app_environment(network),
                    "logConfiguration": {
                        "logDriver": "awslogs",
                        "options": {
                            "awslogs-group": log_group,
                            "awslogs-region": self.region,
                            "awslogs-stream-prefix": "worker",
                        },
                    },
                }
            ],
            tags=[{"key": "Project", "value": PROJECT}, {"key": "Stage", "value": self.stage}],
        )
        return response["taskDefinition"]["taskDefinitionArn"]

    def app_environment(self, network: dict[str, list[str]]) -> list[dict[str, str]]:
        values = {
            "ENVIRONMENT": self.stage,
            "AWS_REGION": self.region,
            "TABLE_NAME": self.names.table,
            "DATA_BUCKET": self.names.data_bucket,
            "ATHENA_DATABASE": self.names.database,
            "ATHENA_WORKGROUP": self.names.prefix,
            "ECS_CLUSTER": self.names.prefix,
            "ECS_TASK_DEFINITION": f"{self.names.prefix}-analytics",
            "ECS_SUBNET_IDS": ",".join(network["subnets"]),
            "ECS_SECURITY_GROUP_IDS": ",".join(network["security_groups"]),
            "CORS_ORIGINS": "*",
        }
        if self.endpoint_url:
            values["AWS_ENDPOINT_URL"] = os.getenv(
                "AWS_INTERNAL_ENDPOINT_URL",
                "http://ministack:4566" if self.stage == "local" else self.endpoint_url,
            )
        return [{"name": key, "value": value} for key, value in values.items()]

    def ensure_analytics_catalog(self) -> None:
        glue = self.aws("glue")
        try:
            glue.get_database(Name=self.names.database)
        except glue.exceptions.EntityNotFoundException:
            glue.create_database(DatabaseInput={"Name": self.names.database, "Description": "CloudPulse analytics catalog"})
        table_input = {
            "Name": "observations",
            "TableType": "EXTERNAL_TABLE",
            "Parameters": {"classification": "json", "EXTERNAL": "TRUE"},
            "StorageDescriptor": {
                "Columns": [
                    {"Name": "location_id", "Type": "string"},
                    {"Name": "location_name", "Type": "string"},
                    {"Name": "observed_at", "Type": "string"},
                    {"Name": "temperature_c", "Type": "double"},
                    {"Name": "relative_humidity_percent", "Type": "double"},
                    {"Name": "wind_speed_kmh", "Type": "double"},
                    {"Name": "european_aqi", "Type": "double"},
                    {"Name": "pm2_5", "Type": "double"},
                    {"Name": "pm10", "Type": "double"},
                    {"Name": "source", "Type": "string"},
                ],
                "Location": f"s3://{self.names.data_bucket}/raw/",
                "InputFormat": "org.apache.hadoop.mapred.TextInputFormat",
                "OutputFormat": "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
                "SerdeInfo": {"SerializationLibrary": "org.openx.data.jsonserde.JsonSerDe"},
            },
        }
        try:
            glue.get_table(DatabaseName=self.names.database, Name="observations")
            glue.update_table(DatabaseName=self.names.database, TableInput=table_input)
        except glue.exceptions.EntityNotFoundException:
            glue.create_table(DatabaseName=self.names.database, TableInput=table_input)
        athena = self.aws("athena")
        try:
            athena.get_work_group(WorkGroup=self.names.prefix)
        except ClientError as error:
            if error_code(error) not in {"InvalidRequestException", "ResourceNotFoundException"}:
                raise
            athena.create_work_group(
                Name=self.names.prefix,
                Description="CloudPulse application queries",
                Configuration={
                    "ResultConfiguration": {"OutputLocation": f"s3://{self.names.data_bucket}/athena-results/"},
                    "EnforceWorkGroupConfiguration": True,
                    "PublishCloudWatchMetricsEnabled": True,
                },
                Tags=[{"Key": "Project", "Value": PROJECT}, {"Key": "Stage", "Value": self.stage}],
            )

    def ensure_lambdas(
        self,
        role_arn: str,
        task_definition: str,
        network: dict[str, list[str]],
    ) -> dict[str, str]:
        archive = ROOT / "build" / "cloudpulse-lambda.zip"
        if not archive.exists():
            archive = package_lambda()
        code = archive.read_bytes()
        lambda_client = self.aws("lambda")
        functions: dict[str, str] = {}
        environment = {item["name"]: item["value"] for item in self.app_environment(network)}
        environment["ECS_TASK_DEFINITION"] = task_definition
        handlers = {
            "health": "cloudpulse.handlers.health.handler",
            "observations": "cloudpulse.handlers.observations.handler",
            "analytics": "cloudpulse.handlers.analytics.handler",
        }
        for suffix, handler in handlers.items():
            name = f"{self.names.prefix}-{suffix}"
            try:
                current = lambda_client.get_function(FunctionName=name)
                lambda_client.update_function_code(FunctionName=name, ZipFile=code, Publish=True)
                if not self.endpoint_url:
                    lambda_client.get_waiter("function_updated_v2").wait(FunctionName=name)
                lambda_client.update_function_configuration(
                    FunctionName=name,
                    Role=role_arn,
                    Handler=handler,
                    Runtime="python3.12",
                    Timeout=30,
                    MemorySize=512,
                    Environment={"Variables": environment},
                )
                functions[suffix] = current["Configuration"]["FunctionArn"]
            except lambda_client.exceptions.ResourceNotFoundException:
                response = lambda_client.create_function(
                    FunctionName=name,
                    Runtime="python3.12",
                    Role=role_arn,
                    Handler=handler,
                    Code={"ZipFile": code},
                    Timeout=30,
                    MemorySize=512,
                    Publish=True,
                    Environment={"Variables": environment},
                    Architectures=["x86_64"],
                    Tags={"Project": PROJECT, "Stage": self.stage},
                )
                functions[suffix] = response["FunctionArn"]
        return functions

    def ensure_api(self, functions: dict[str, str]) -> str:
        gateway = self.aws("apigatewayv2")
        existing = next(
            (api for api in gateway.get_apis().get("Items", []) if api["Name"] == self.names.prefix),
            None,
        )
        if existing:
            api_id = existing["ApiId"]
        else:
            api_id = gateway.create_api(
                Name=self.names.prefix,
                ProtocolType="HTTP",
                CorsConfiguration={
                    "AllowOrigins": ["*"],
                    "AllowMethods": ["GET", "POST", "OPTIONS"],
                    "AllowHeaders": ["content-type"],
                    "MaxAge": 3600,
                },
                Tags={"Project": PROJECT, "Stage": self.stage},
            )["ApiId"]
        routes = {
            "GET /health": "health",
            "GET /locations": "observations",
            "POST /locations": "observations",
            "ANY /locations/{proxy+}": "observations",
            "ANY /analytics/{proxy+}": "analytics",
        }
        integrations = gateway.get_integrations(ApiId=api_id).get("Items", [])
        integration_ids: dict[str, str] = {}
        for suffix, function_arn in functions.items():
            description = f"CloudPulse {suffix} Lambda"
            existing_integration = next((item for item in integrations if item.get("Description") == description), None)
            if existing_integration:
                integration_ids[suffix] = existing_integration["IntegrationId"]
            else:
                integration_ids[suffix] = gateway.create_integration(
                    ApiId=api_id,
                    IntegrationType="AWS_PROXY",
                    IntegrationUri=function_arn,
                    IntegrationMethod="POST",
                    PayloadFormatVersion="2.0",
                    TimeoutInMillis=30000,
                    Description=description,
                )["IntegrationId"]
        current_routes = {item["RouteKey"]: item for item in gateway.get_routes(ApiId=api_id).get("Items", [])}
        for route_key, suffix in routes.items():
            target = f"integrations/{integration_ids[suffix]}"
            if route_key in current_routes:
                gateway.update_route(ApiId=api_id, RouteId=current_routes[route_key]["RouteId"], Target=target)
            else:
                gateway.create_route(ApiId=api_id, RouteKey=route_key, Target=target)
        stages = gateway.get_stages(ApiId=api_id).get("Items", [])
        if not any(stage["StageName"] == "$default" for stage in stages):
            gateway.create_stage(ApiId=api_id, StageName="$default", AutoDeploy=True)
        lambda_client = self.aws("lambda")
        for suffix in set(routes.values()):
            statement_id = f"{self.names.prefix}-apigateway"
            try:
                lambda_client.add_permission(
                    FunctionName=f"{self.names.prefix}-{suffix}",
                    StatementId=statement_id,
                    Action="lambda:InvokeFunction",
                    Principal="apigateway.amazonaws.com",
                    SourceArn=f"arn:{self.partition}:execute-api:{self.region}:{self.names.account_id}:{api_id}/*",
                )
            except lambda_client.exceptions.ResourceConflictException:
                pass
        return f"https://{api_id}.execute-api.{self.region}.amazonaws.com"

    def ensure_cloudfront(self) -> dict[str, str | None]:
        if self.endpoint_url:
            return {"id": None, "url": f"s3://{self.names.web_bucket}"}
        cloudfront = self.aws("cloudfront")
        oac_name = f"{self.names.prefix}-oac"
        controls = cloudfront.list_origin_access_controls().get("OriginAccessControlList", {}).get("Items", [])
        control = next((item for item in controls if item["Name"] == oac_name), None)
        if control:
            oac_id = control["Id"]
        else:
            oac_id = cloudfront.create_origin_access_control(
                OriginAccessControlConfig={
                    "Name": oac_name,
                    "Description": "CloudPulse private web bucket access",
                    "SigningProtocol": "sigv4",
                    "SigningBehavior": "always",
                    "OriginAccessControlOriginType": "s3",
                }
            )["OriginAccessControl"]["Id"]
        distributions = cloudfront.list_distributions().get("DistributionList", {}).get("Items", [])
        distribution = next((item for item in distributions if item.get("Comment") == self.names.prefix), None)
        if not distribution:
            origin_id = f"S3-{self.names.web_bucket}"
            distribution = cloudfront.create_distribution(
                DistributionConfig={
                    "CallerReference": f"{self.names.prefix}-{int(time.time())}",
                    "Comment": self.names.prefix,
                    "Enabled": True,
                    "DefaultRootObject": "index.html",
                    "PriceClass": "PriceClass_100",
                    "Origins": {
                        "Quantity": 1,
                        "Items": [
                            {
                                "Id": origin_id,
                                "DomainName": f"{self.names.web_bucket}.s3.{self.region}.amazonaws.com",
                                "OriginAccessControlId": oac_id,
                                "S3OriginConfig": {"OriginAccessIdentity": ""},
                            }
                        ],
                    },
                    "DefaultCacheBehavior": {
                        "TargetOriginId": origin_id,
                        "ViewerProtocolPolicy": "redirect-to-https",
                        "AllowedMethods": {"Quantity": 3, "Items": ["GET", "HEAD", "OPTIONS"], "CachedMethods": {"Quantity": 3, "Items": ["GET", "HEAD", "OPTIONS"]}},
                        "Compress": True,
                        "ForwardedValues": {"QueryString": False, "Cookies": {"Forward": "none"}},
                        "MinTTL": 0,
                        "DefaultTTL": 3600,
                        "MaxTTL": 86400,
                    },
                    "CustomErrorResponses": {
                        "Quantity": 2,
                        "Items": [
                            {"ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 0},
                            {"ErrorCode": 404, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 0},
                        ],
                    },
                }
            )["Distribution"]
        distribution_arn = f"arn:{self.partition}:cloudfront::{self.names.account_id}:distribution/{distribution['Id']}"
        self.aws("s3").put_bucket_policy(
            Bucket=self.names.web_bucket,
            Policy=json.dumps(
                {
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Sid": "AllowCloudFrontRead",
                            "Effect": "Allow",
                            "Principal": {"Service": "cloudfront.amazonaws.com"},
                            "Action": "s3:GetObject",
                            "Resource": f"arn:{self.partition}:s3:::{self.names.web_bucket}/*",
                            "Condition": {"StringEquals": {"AWS:SourceArn": distribution_arn}},
                        }
                    ],
                }
            ),
        )
        return {"id": distribution["Id"], "url": f"https://{distribution['DomainName']}"}

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

    def seed_location(self) -> None:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            self.aws("dynamodb").put_item(
                TableName=self.names.table,
                Item={
                    "PK": {"S": "LOCATION#melbourne"},
                    "SK": {"S": "PROFILE"},
                    "entity_type": {"S": "LOCATION"},
                    "id": {"S": "melbourne"},
                    "name": {"S": "Melbourne"},
                    "latitude": {"N": "-37.8136"},
                    "longitude": {"N": "144.9631"},
                    "created_at": {"S": now},
                },
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as error:
            if error_code(error) != "ConditionalCheckFailedException":
                raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Provision CloudPulse AWS infrastructure with boto3")
    parser.add_argument("--stage", default="dev", choices=["local", "dev", "prod"])
    parser.add_argument("--endpoint-url", default=os.getenv("AWS_ENDPOINT_URL"))
    parser.add_argument("--build-worker", action="store_true", help="Build and push ECS image")
    parser.add_argument("--web-dist", type=Path, help="Upload built frontend directory")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    infrastructure = Infrastructure(args.stage, args.endpoint_url)
    infrastructure.provision(build_worker=args.build_worker, web_dist=args.web_dist)


if __name__ == "__main__":
    main()
