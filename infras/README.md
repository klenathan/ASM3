# AWS infrastructure

OpenTofu provisions a low-cost demo environment in AWS:

- CloudFront serves the private React and media S3 buckets.
- CloudFront forwards `/api/*` without caching to API Gateway.
- API Gateway proxies to one ECS service on one EC2 container instance.
- RDS PostgreSQL is Single-AZ and private across two database subnets.
- Secrets Manager injects `DATABASE_URL`; ECR stores backend images.
- CloudWatch keeps backend logs for 14 days and SSM provides shell access without SSH.

The design deliberately omits NAT Gateway, load balancers, Fargate, Multi-AZ RDS, and paid container insights. The EC2 port is public because HTTP API Gateway has no stable source CIDR; the application remains the authorization boundary. Add an NLB with an API Gateway VPC Link before using this beyond coursework/demo scope.

## Prerequisites

- OpenTofu 1.9 or newer
- AWS CLI authenticated with SSO or a named profile
- AWS permissions to create the resources listed above
- Docker for building the backend image

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

The initial `app_desired_count = 0` is intentional because ECR is empty. It does not stop EC2, RDS, EIP, and storage charges; destroy the root stack whenever the demo is not in active use. Set `web_origin` to the `site_url` output before starting the backend so cookie CORS is exact.

## 3. Publish application artifacts

Build and upload the frontend with `VITE_API_URL` set to the CloudFront site origin (the client already appends `/api/v1` paths where required):

```sh
SITE_URL=$(tofu output -raw site_url)
WEB_BUCKET=$(tofu output -raw web_bucket_name)
cd ../web
VITE_API_URL="$SITE_URL" pnpm build
aws s3 sync dist/ "s3://$WEB_BUCKET/" --delete
```

Build and push the backend image:

```sh
cd ../backend
REPOSITORY=$(tofu -chdir=../infras output -raw backend_ecr_repository_url)
REGISTRY=${REPOSITORY%/*}
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "$REGISTRY"
docker build -t "$REPOSITORY:latest" .
docker push "$REPOSITORY:latest"
```

Set `web_origin` to `site_url` and `app_desired_count = 1` in the ignored `terraform.tfvars`, then run `tofu plan` and `tofu apply`. For later same-tag deployments, force ECS to pull the new image:

```sh
aws ecs update-service \
  --cluster "$(tofu output -raw ecs_cluster_name)" \
  --service "$(tofu output -raw ecs_service_name)" \
  --force-new-deployment
```

Use immutable image tags in repeatable CI deployments rather than `latest`.

## Teardown

Empty the content buckets first, or set `force_destroy_buckets = true` for the final apply, then destroy the root stack. This releases the EC2 instance, public IPv4 address, RDS instance, and other recurring-cost resources:

```sh
tofu plan -destroy -out=destroy.tfplan
tofu apply destroy.tfplan
```

The state bucket has `prevent_destroy`. After the root stack is gone, remove old state object versions and delete the bucket manually only when the project no longer needs recovery or audit history.
