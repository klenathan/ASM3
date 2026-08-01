# Low-cost OpenTofu infrastructure

This folder contains the complete replacement for the old boto3 deployer.
It intentionally uses one public subnet in one Availability Zone and has no
NAT gateway, ALB, ECS, or Azure resources. RDS
provides HTTPS delivery for private media objects in S3 through Origin Access
Control; the media bucket is not publicly readable.

The API runs on one public `t3.micro` EC2 instance and uses a private,
single-AZ `db.t3.micro` PostgreSQL RDS instance. S3 website hosting replaces
Amplify. The web bucket is public by design to keep the deployment small and
inexpensive. CloudFront uses `PriceClass_100` to limit edge locations and cost.

## Use

```sh
tofu init
tofu fmt -recursive
tofu validate
tofu plan -var-file=terraform.tfvars
tofu apply -var-file=terraform.tfvars
```

Copy `terraform.tfvars.example` to `terraform.tfvars`. Do not commit the copy.

Build and push the backend image to the output `backend_repository`, then set
`backend_image` to that immutable image URI and apply again. If it is empty,
OpenTofu creates the EC2 host and AWS resources but does not start the API.

Upload the built SPA to the `web_url` bucket after the web build:

```sh
aws s3 sync apps/web/dist "s3://$(tofu output -raw web_bucket_name)"
```

The public-subnet design saves cost but is intentionally not a production
security baseline. The backend is configured for PostgreSQL on RDS.
