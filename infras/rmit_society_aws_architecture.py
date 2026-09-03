from diagrams import Cluster, Diagram, Edge
from diagrams.aws.analytics import Athena, Glue
from diagrams.aws.compute import ECR, EC2, ECS, Lambda
from diagrams.aws.database import RDS
from diagrams.aws.integration import Eventbridge, SQS, StepFunctions
from diagrams.aws.management import Cloudwatch
from diagrams.aws.mobile import Amplify
from diagrams.aws.network import APIGateway, Endpoint, InternetGateway
from diagrams.aws.security import SecretsManager
from diagrams.aws.storage import S3
from diagrams.generic.compute import Rack
from diagrams.onprem.client import Users


PRIMARY = "#B5432A"
ASYNC = "#9A6A00"
SUPPORT = "#6B7280"


with Diagram(
    "RMIT Society — AWS Architecture",
    filename="infras/rmit_society_aws_architecture",
    direction="TB",
    show=False,
    outformat="png",
    graph_attr={
        "bgcolor": "#FFF9F2",
        "pad": "0.35",
        "nodesep": "1.1",
        "ranksep": "0.95",
        "splines": "ortho",
        "fontname": "Arial",
        "fontsize": "24",
        "fontcolor": "#2E2521",
    },
    node_attr={
        "fontname": "Arial",
        "fontsize": "13",
        "fontcolor": "#2E2521",
    },
    edge_attr={
        "fontname": "Arial",
        "fontsize": "10",
        "fontcolor": "#5A4035",
    },
):
    users = Users("RMIT students, moderators\\nand system administrators")
    with Cluster(
        "Infrastructure delivery — external",
        graph_attr={
            "style": "dotted",
            "color": "#7C3AED",
            "penwidth": "2",
        },
    ):
        developers = Users("Developers")
        opentofu = Rack("OpenTofu / Terraform\\nInfrastructure as Code")
    ai_provider = Rack("OpenRouter / DeepSeek\\nexternal AI provider")

    with Cluster("AWS Cloud — us-east-1"):
        with Cluster("Main community services"):
            web = Amplify("Amplify Hosting\nReact SPA + /api rewrite")
            api = APIGateway("API Gateway (HTTP API)\npublic HTTPS API")
            media = S3("S3 media bucket\npublic media objects")
            thread_events = SQS("Thread events queue\nwith DLQ")

        with Cluster("Content safety analysis — optional"):
            reanalysis_queue = SQS("Content re-analysis queue\nECS long-poll; DLQ")
            analysis = Lambda("Content analysis Lambda\nS3 read; outside VPC")

        with Cluster("Admin analytics and reporting — optional"):
            scheduler = Eventbridge("EventBridge rule + API destination\nnightly analytics refresh")
            scheduler_dlq = SQS("Analytics scheduler DLQ")
            refresh = StepFunctions("Analytics refresh\nStep Functions")
            glue = Glue("Glue export + Data Catalog\nRDS extract → Parquet")
            athena = Athena("Athena workgroup\naction metrics")
            analytics_store = S3("Analytics S3\nParquet + query results")

        with Cluster("Shared platform, deployment, and data services"):
            ecr = ECR("Amazon ECR repository\nbackend + bootstrap images")
            state_bucket = S3("OpenTofu state bucket\nversioned remote state")
            secrets = SecretsManager("Secrets Manager\nDB URL + analysis secrets")
            cloudwatch = Cloudwatch("CloudWatch Logs\nAPI, ECS, Lambda")
            with Cluster("VPC"):
                internet_gateway = InternetGateway("Internet Gateway")
                with Cluster("Public subnet — one Availability Zone"):
                    ecs_host = EC2("EC2 ECS container instance\npublic EIP")
                    with Cluster(
                        "ECS cluster / service and task definitions",
                        graph_attr={
                            "style": "dotted",
                            "color": "#7C3AED",
                            "penwidth": "2",
                        },
                    ):
                        ecs_service = ECS("ECS service\nbackend")
                        backend = ECS("Backend task\nAPI + long-poll worker")
                        bootstrap = ECS("Database bootstrap task\nmigrations + seed (one-shot)")

                with Cluster("Private database subnet group — two Availability Zones"):
                    database = RDS("RDS PostgreSQL\nprivate, Single-AZ")
                    workflow = Lambda("Analytics workflow Lambda\nVPC-connected; persists metrics")
                    endpoints = Endpoint("VPC endpoints\nS3, Athena, Secrets Manager, Logs")
    developers >> Edge(label="HCL changes", style="dashed", color=SUPPORT) >> opentofu
    opentofu >> Edge(
        label="plan / apply AWS stack",
        style="dashed",
        color=SUPPORT,
    ) >> web
    opentofu >> Edge(label="remote state", style="dashed", color=SUPPORT) >> state_bucket
    opentofu >> Edge(style="dashed", color=SUPPORT) >> ecr
    opentofu >> Edge(style="dashed", color=SUPPORT) >> ecs_service
    opentofu >> Edge(style="dashed", color=SUPPORT) >> database
    ecr >> Edge(label="pull container images", style="dashed", color=SUPPORT) >> backend
    secrets >> Edge(label="runtime secrets", style="dashed", color=SUPPORT) >> backend
    secrets >> Edge(style="dashed", color=SUPPORT) >> analysis
    secrets >> Edge(style="dashed", color=SUPPORT) >> workflow
    [api, backend, analysis, workflow] >> Edge(label="application logs", style="dashed", color=SUPPORT) >> cloudwatch
    workflow >> Edge(label="private AWS APIs", style="dashed", color=SUPPORT) >> endpoints
    web >> Edge(label="/api/* rewrite", color=PRIMARY, penwidth="2") >> api
    api >> Edge(label="HTTP proxy", color=PRIMARY, penwidth="2") >> internet_gateway
    internet_gateway >> Edge(label="public EIP", color=PRIMARY, penwidth="2") >> ecs_service
    ecs_service >> Edge(label="runs task", style="dashed", color=SUPPORT) >> backend
    backend >> Edge(label="runs on", style="dashed", color=SUPPORT) >> ecs_host
    bootstrap >> Edge(label="runs on", style="dashed", color=SUPPORT) >> ecs_host
    bootstrap >> Edge(label="before service starts", style="dashed", color=SUPPORT) >> ecs_service
    bootstrap >> Edge(label="migrations + seed", color=PRIMARY) >> database
    backend >> Edge(label="SQL", color=PRIMARY, penwidth="2") >> database
    backend >> Edge(label="store / retrieve media", color=PRIMARY) >> media

    backend >> Edge(label="thread.created events", color=ASYNC) >> thread_events
    thread_events >> Edge(label="audit consumer", color=ASYNC) >> backend
    backend >> Edge(label="re-analysis jobs", color=ASYNC) >> reanalysis_queue
    reanalysis_queue >> Edge(label="long poll", color=ASYNC) >> backend
    backend >> Edge(label="invoke", color=ASYNC) >> analysis
    analysis >> Edge(label="HTTPS inference", color=ASYNC) >> ai_provider

    scheduler >> Edge(label="nightly POST via API destination", color=ASYNC) >> api
    scheduler >> Edge(label="exhausted deliveries", style="dashed", color=SUPPORT) >> scheduler_dlq
    backend >> Edge(label="start refresh", color=ASYNC, penwidth="2") >> refresh
    refresh >> Edge(label="orchestrate export", color=ASYNC) >> glue
    glue >> Edge(label="partitioned Parquet + manifest", color=ASYNC) >> analytics_store
    analytics_store >> Edge(label="query datasets", color=ASYNC) >> athena
    athena >> Edge(label="metric results", color=ASYNC) >> workflow
