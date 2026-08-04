# Learner Lab — verified service availability & restrictions

Source: Vocareum Learner Lab README (services section) for the active lab.
Region: **us-east-1** / **us-west-2** only. Any other region console returns access errors.

## ⚠️ Critical gaps vs current stack

These services are **NOT** in the lab's available-services list:

- **AWS Amplify — NOT available.** The current frontend strategy (`infras/amplify.tf`,
  AGENTS "Frontend hosting") depends on Amplify to host the SPA and rewrite `/api/*`
  to API Gateway. This breaks the planned frontend hosting and the first-party-cookie
  proxy design.
- **CloudFront — NOT available.** AGENTS allows CloudFront "only when Amplify cannot
  satisfy a confirmed product need"; it cannot be used at all in this lab either.

Both assumptions in the current module docs/architecture are unprovisionable in this
lab. Do not silently redesign — record the limitation and get approval for an
alternative (candidate: Static EC2/Nginx or S3 website origin → API Gateway).

## Services available with active restrictions

| Service | Restrictions / LabRole |
|---|---|
| API Gateway | can assume LabRole |
| Application Auto Scaling | can assume LabRole |
| Athena | can assume LabRole |
| Aurora | (listed, no extra notes) |
| AWS Backup | — |
| AWS Batch | can assume LabRole |
| ACM | — |
| Cloud9 | can assume LabRole; types nano–large, c4.xlarge |
| CloudFormation | can assume LabRole |
| CloudShell | — |
| CloudTrail | can assume LabRole; no CloudWatch logging for trail |
| CloudWatch | — |
| CodeCommit / CodeDeploy | can assume LabRole |
| Config | — |
| Cost & Usage Report / Cost Explorer | — |
| DynamoDB | can assume LabRole |
| EC2 Auto Scaling | can assume LabRole; types nano–large |
| Elastic Beanstalk | can assume LabRole; types nano–large; use LabRole/LabInstanceProfile/vockey |
| EBS | max 100 GB; **no PIOPS**; gp2/gp3/sc1/standard |
| EC2 | can assume LabRole; AMIs us-east-1/us-west-2 only, **no Marketplace AMIs**; types **nano–large**; On-Demand only; **max 9 concurrent instances**, **32 vCPU**; >20 instances ⇒ account deactivated; **EC2 Fleet NOT supported**; use pre-created `LabRole`/`LabInstanceProfile`; `vockey` key only in us-east-1 |
| ECR | LabRole read-only; console user write |
| ECS | types nano–large; to avoid role errors create ASG in EC2 console first, use existing ASG for cluster; set **LabRole** as task role + execution role |
| EFS | can assume LabRole |
| EKS | can assume LabEksClusterRole; types nano–large |
| ELB | can assume LabRole |
| EMR | can assume LabRole; types nano–large; max 32 vCPU / 9 instances; cluster stops with session |
| ElastiCache | — |
| EventBridge | can assume LabRole |
| Fargate | can assume LabRole |
| Glue | can assume LabRole; worker G.1X/Standard, max 10 workers, concurrency 1 |
| Glue DataBrew | can assume LabRole |
| GuardDuty / Health / Inspector | — |
| IAM | **extremely limited**; cannot create users/groups/roles (except service-linked); use pre-created `LabRole` |
| IoT Core | can assume LabRole |
| KMS | can assume LabRole |
| Kinesis | can assume LabRole |
| Lambda | attach LabRole; **max 10 concurrent execution envs** |
| Q Developer | — |
| Redshift | can assume LabRole; ra3.large only, max 2 instances |
| Rekognition | can assume LabRole; face/label limit 1000, inference unit 1 |
| RDS | can assume LabRole; engines incl. PostgreSQL; types **nano, micro, small, medium**; storage EBS ≤100 GB gp2; **no PIOPS**; On-Demand only; **Enhanced Monitoring NOT supported** (must uncheck); stopped RDS auto-restarts after 7 days |
| Resource Groups & Tag Editor | can assume LabRole |
| Route 53 | **cannot register a domain** |
| SageMaker | can assume LabRole; limited types; max 2 notebooks, 2 apps |
| Secrets Manager | can assume LabRole |
| Security Hub / STS / SAR / SWF / Step Functions | — |
| Service Catalog | can assume LabRole |
| SNS / SQS | can assume LabRole |
| S3 | can assume LabRole |
| S3 Glacier | no vault lock |
| SSM | pre-created LabRole/LabInstanceProfile for Session Manager |
| Trusted Advisor | — |
| VPC | — |
| WAF | — |
| Well-Architected Tool | — |
| Marketplace Subscriptions | read-only only |

## Key cross-cutting limits

- **Regions:** only us-east-1 and us-west-2.
- **EC2:** max 9 concurrent instances AND 32 vCPU per region; >20 instances ⇒
  immediate account deactivation + deletion. Includes instances from ECS/EMR/Beanstalk.
- **IAMI:** no user/group/role creation (except service-linked). Always reuse `LabRole`
  + `LabInstanceProfile`; ECS task role = LabRole.
- **RDS:** no Multi-AZ, no Enhanced Monitoring, no PIOPS. Single small Single-AZ.
- **Budget:** exceeding budget disables the lab and deletes all progress. Budget data
  lags 8–12h. Leave RDS/EC2 stopped or destroy; End Lab does not reliably stop RDS.
- **Reset** permanently deletes everything (irreversible).

## Confirmed usable for current stack (unchanged)
API Gateway, ECR, ECS (EC2 launch type), EC2, S3, RDS, Secrets Manager, SQS/SNS,
Lambda, SSM, CloudWatch, VPC.

## Computed from this (aligned with current decisions)
- ECS EC2-type: create ASG in EC2 console first, then point ECS cluster at it — matches
  existing `compute.tf` approach.
- Task execution role = LabRole.
- RDS: nano–medium, gp2, no Enhanced Monitoring.
- EC2 t3.micro, gp3 30GB within EBS 100GB limit.
