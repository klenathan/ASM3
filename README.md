# Cloud Computing Assessment 3

This repository uses [MiniStack](https://github.com/ministackorg/ministack) as the local AWS emulator. All emulated AWS APIs are available through `http://localhost:4566`.

## Prerequisites

- Docker with Docker Compose
- AWS CLI v2 for running the examples below

## Start The Local AWS Emulator

The Compose setup is equivalent to the requested basic command:

```sh
docker run -p 4566:4566 ministackorg/ministack
```

It additionally persists state under `./temp-data/ministack-data` and mounts the Docker socket so MiniStack can run container-backed Lambda, ECS, and RDS resources.

```sh
docker compose up -d
docker compose ps
curl http://localhost:4566/_ministack/health
```

Compose has usable defaults, so creating a `.env` file is optional. To customize the defaults:

```sh
cp .env.example .env
```

Stop MiniStack without deleting its state:

```sh
docker compose down
```

Delete MiniStack and all persisted local AWS state:

```sh
docker compose down
rm -rf ./temp-data/ministack-data
```

## AWS CLI

Load the local-only credentials and endpoint before using the AWS CLI:

```sh
set -a
source .env 2>/dev/null || source .env.example
set +a
aws sts get-caller-identity
aws s3 mb s3://asm3-local
aws s3 ls
```

`AWS_ENDPOINT_URL` routes modern AWS CLI and SDK clients to MiniStack. If a tool does not support that environment variable, pass the endpoint explicitly:

```sh
aws --endpoint-url=http://localhost:4566 dynamodb list-tables
```

Use the same endpoint, region, and fake credentials when constructing application AWS SDK clients. Applications running on the host use `http://localhost:4566`; containers on the `asm3-local` Docker network use `http://ministack:4566`.

## Backend

The backend API runs as a persistent FastAPI server (`rmit_society.server:app`)
rather than as Lambda functions, so local development is a plain uvicorn process
against MiniStack — no Lambda zip packaging.

```sh
make deploy-local
set -a
source .env 2>/dev/null || source .env.example
source .cloudpulse/local.env
set +a
cd backend
uv sync
uv run uvicorn rmit_society.server:app --app-dir src --port 8000
# In another terminal:
curl http://localhost:8000/api/v1/health
```

`make deploy-local` provisions Cognito and writes pool/client verifier settings to
`.cloudpulse/local.env`. The local web login can create and sign in accounts
through Cognito. `make dev-backend` loads this generated file automatically.

Sourcing the root environment file is required: it gives the host-run API the
MiniStack endpoint and provisioned queue URLs. Without it, async moderation
messages are not sent to the local queues.

In dev/prod, `infra/deploy.py` launches an EC2 instance that runs the same
backend image on port 8000. In `--stage local`, the deploy also launches the
EC2 instance against MiniStack (so the EC2 resource, security group, IAM
instance profile, AMI lookup, and idempotent reuse are exercised by the deploy
workflow), but MiniStack only emulates the instance as `running` and cannot
boot the Docker container, so the real API still runs via host uvicorn against
MiniStack. SQS consumers (moderation/image/events) remain Lambda functions and
may move to the EC2 container later.

The real AWS deployment is still a scaffold, not production-ready: hosted Cognito
UI wiring, TLS/edge routing, CloudFront provisioning, backend health-gated
deployments, and running-instance image updates remain incomplete.

## Assessment Service Coverage

The assessment requires services from Compute, Containers, Storage, Networking and Content Delivery, Database, and Analytics. MiniStack can locally emulate suitable services in each category, including Lambda, ECS, S3, API Gateway, DynamoDB/RDS, and EMR/Athena.

The default image requested for this project uses MiniStack's mock Athena engine. For real local Athena SQL execution through DuckDB, set this in `.env`:

```dotenv
MINISTACK_IMAGE=ministackorg/ministack:full
```

MiniStack is only a local development and integration-test environment. The assessment specification also requires the completed application to be deployed to AWS, and every claimed service must be invoked automatically by application operations rather than only through the AWS CLI or console.

## Security

The credentials in `.env.example` are fake and valid only for MiniStack. `.env` files are ignored by Git. Never put real AWS access keys in this repository.
