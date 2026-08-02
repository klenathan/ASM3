# AWS Academy Learner Lab pre-provisioned permissions.
# Learner Lab blocks iam:CreateRole and iam:CreateOpenIDConnectProvider, so
# application resources reuse the supplied role and instance profile.
data "aws_iam_role" "learner_lab" {
  name = var.learner_lab_role_name
}

data "aws_iam_instance_profile" "learner_lab" {
  name = var.learner_lab_instance_profile_name
}
