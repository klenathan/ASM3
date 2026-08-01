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

## Assessment Service Coverage

The assessment requires services from Compute, Containers, Storage, Networking and Content Delivery, Database, and Analytics. MiniStack can locally emulate suitable services in each category, including Lambda, ECS, S3, API Gateway, DynamoDB/RDS, and EMR/Athena.

The default image requested for this project uses MiniStack's mock Athena engine. For real local Athena SQL execution through DuckDB, set this in `.env`:

```dotenv
MINISTACK_IMAGE=ministackorg/ministack:full
```

MiniStack is only a local development and integration-test environment. The assessment specification also requires the completed application to be deployed to AWS, and every claimed service must be invoked automatically by application operations rather than only through the AWS CLI or console.

## Security

The credentials in `.env.example` are fake and valid only for MiniStack. `.env` files are ignored by Git. Never put real AWS access keys in this repository.
