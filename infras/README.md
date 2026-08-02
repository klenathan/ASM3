# AWS infrastructure

OpenTofu provisions a low-cost demo environment in AWS:

- AWS Amplify hosts the React client and rewrites its `/api/*` requests to API Gateway.
- API Gateway proxies API requests to the backend container on one ECS service and one EC2 container instance.
- S3 stores public media objects.
- RDS PostgreSQL is Single-AZ and private across two database subnets.
- Secrets Manager injects `DATABASE_URL`; ECR stores backend images.
- CloudWatch keeps application logs for 7 days and SSM provides shell access without SSH.

The design deliberately omits a directly managed CloudFront distribution, NAT Gateway, load balancers, Fargate, Multi-AZ RDS, and paid container insights. Learner Lab uses its pre-created `LabRole` and `LabInstanceProfile`. Amplify's generated `https://*.amplifyapp.com` site hosts the SPA and proxies `/api/*` to API Gateway, keeping session cookies first-party. API Gateway then routes those requests to the backend. This is a coursework-only setup: the EC2 backend port remains public because HTTP API Gateway has no stable source CIDR, and public media still uses an S3 policy. The application remains the authorization boundary. Add an NLB with an API Gateway VPC Link before using this beyond coursework/demo scope.

## Prerequisites

- OpenTofu 1.9 or newer
- AWS CLI authenticated with SSO or a named profile
- AWS Academy Learner Lab with pre-created `LabRole` and `LabInstanceProfile`
- Docker for building the backend image
- pnpm, zip, and curl for publishing the frontend artifact

Never put AWS keys, database passwords, or other secrets in `.tfvars` or source control.

## 1. Create remote state

The bootstrap stack stays in local state and creates an encrypted, versioned S3 bucket. Noncurrent state versions expire after 90 days; keep its local state secure. Use the same region in both stacks. The supplied configuration uses US East (N. Virginia) (`us-east-1`).

```sh
cd infras/bootstrap
cp terraform.tfvars.example terraform.tfvars
tofu init
tofu apply
```

Record the `state_bucket_name` output. The root stack uses S3's native conditional lockfile, so no DynamoDB lock table is needed.

## 2. Initialize and deploy

```sh
cd ..
cp terraform.tfvars.example terraform.tfvars
tofu init \
  -backend-config="bucket=STATE_BUCKET_NAME" \
  -backend-config="key=demo/infrastructure.tfstate" \
  -backend-config="region=us-east-1"
tofu plan -out=deployment.tfplan
tofu apply deployment.tfplan
```

The initial `app_desired_count = 0` is intentional because the backend ECR repository is empty. It does not stop EC2, RDS, EIP, Amplify, and storage charges; destroy the root stack whenever the demo is not in active use. The Amplify site proxies API requests through its own origin, so session cookies remain first-party.

## 3. Publish application artifacts

Build and publish the frontend artifact to the Amplify production branch:

```sh
./scripts/deploy-frontend.sh
# or
make deploy-frontend
```

The script sources an optional root `.env`, builds `web/`, then creates and starts
an Amplify deployment using a signed archive upload. It sets `VITE_API_URL` to the
Amplify site origin so API requests use Amplify's `/api/*` rewrite rule.

Build and push the backend image from an authenticated development machine:

```sh
./scripts/push-backend-ecr.sh latest
# or
make push-backend BACKEND_IMAGE_TAG=latest
```

The script uses `linux/amd64` by default because the Learner Lab ECS instance uses
an x86 `t3.micro`. It cross-builds correctly on Apple Silicon. Override only when
deployment infrastructure is ARM-based:

```sh
TARGET_PLATFORM=linux/arm64 ./scripts/push-backend-ecr.sh latest
```

The backend GitHub Actions workflow builds pull requests. Learner Lab blocks
creation of GitHub OIDC providers and roles, so image publishing stays manual.

Set `app_desired_count = 1` in the ignored `terraform.tfvars`, then run `tofu plan` and `tofu apply`. For later same-tag deployments, force ECS to pull the new images:

```sh
aws ecs update-service \
  --cluster "$(tofu output -raw ecs_cluster_name)" \
  --service "$(tofu output -raw ecs_service_name)" \
  --force-new-deployment
```

Use immutable image tags in repeatable CI deployments rather than `latest`.

## Optional custom domain

The generated API Gateway URL is already HTTPS. For a branded domain, request or import an ACM certificate in the same region as this stack, then set both `api_custom_domain_name` and `api_custom_domain_certificate_arn`. After apply, create a CNAME at your DNS provider using `api_custom_domain_target`, or a Route 53 alias using that target and `api_custom_domain_hosted_zone_id`. API Gateway custom domains support TLS 1.2.

## Teardown

Empty the content buckets first, or set `force_destroy_buckets = true` for the final apply, then destroy the root stack. This releases the EC2 instance, public IPv4 address, RDS instance, and other recurring-cost resources:

```sh
tofu plan -destroy -out=destroy.tfplan
tofu apply destroy.tfplan
```

The state bucket has `prevent_destroy`. After the root stack is gone, remove old state object versions and delete the bucket manually only when the project no longer needs recovery or audit history.
