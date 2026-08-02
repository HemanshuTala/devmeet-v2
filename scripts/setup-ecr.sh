#!/usr/bin/env bash
# =============================================================================
# DevMeet — Create ECR Repositories for all 13 services + api-gateway
# =============================================================================
# Usage:
#   chmod +x scripts/setup-ecr.sh
#   AWS_REGION=eu-north-1 ./scripts/setup-ecr.sh
#
# Prerequisites:
#   - AWS CLI installed and configured (aws configure)
#   - IAM permissions: ecr:CreateRepository, ecr:DescribeRepositories,
#     ecr:SetRepositoryPolicy, ecr:PutLifecyclePolicy
# =============================================================================

set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-north-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SERVICES=(
  "devmeet-auth-service"
  "devmeet-user-service"
  "devmeet-orchestrator-service"
  "devmeet-ai-interviewer-service"
  "devmeet-code-execution-service"
  "devmeet-video-service"
  "devmeet-feedback-service"
  "devmeet-notification-service"
  "devmeet-analytics-service"
  "devmeet-admin-service"
  "devmeet-file-service"
  "devmeet-payment-service"
  "devmeet-search-service"
  "devmeet-api-gateway"
)

echo ""
echo "============================================="
echo " DevMeet ECR Repository Setup"
echo "============================================="
echo " Account : ${AWS_ACCOUNT_ID}"
echo " Region  : ${AWS_REGION}"
echo " Registry: ${ECR_REGISTRY}"
echo "============================================="
echo ""

# Lifecycle policy: keep last 10 tagged images + auto-expire untagged after 1 day
LIFECYCLE_POLICY='{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Remove untagged images after 1 day",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 1
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Keep only last 10 tagged images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["latest", "sha-"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    }
  ]
}'

created=0
existing=0
failed=0

for repo in "${SERVICES[@]}"; do
  echo -n "Creating ${repo}... "

  # Check if already exists
  if aws ecr describe-repositories \
       --repository-names "${repo}" \
       --region "${AWS_REGION}" \
       --query "repositories[0].repositoryName" \
       --output text 2>/dev/null | grep -q "${repo}"; then
    echo -e "${YELLOW}already exists${NC}"
    existing=$((existing + 1))
  else
    if aws ecr create-repository \
         --repository-name "${repo}" \
         --region "${AWS_REGION}" \
         --image-scanning-configuration scanOnPush=true \
         --encryption-configuration encryptionType=AES256 \
         --output json > /dev/null 2>&1; then
      echo -e "${GREEN}created${NC}"
      created=$((created + 1))
    else
      echo -e "${RED}FAILED${NC}"
      failed=$((failed + 1))
    fi
  fi

  # Apply lifecycle policy (idempotent)
  aws ecr put-lifecycle-policy \
    --repository-name "${repo}" \
    --region "${AWS_REGION}" \
    --lifecycle-policy-text "${LIFECYCLE_POLICY}" \
    --output json > /dev/null 2>&1 || true
done

echo ""
echo "============================================="
echo " Done: ${created} created | ${existing} existing | ${failed} failed"
echo "============================================="
echo ""
echo "Next step — authenticate Docker with ECR and push images:"
echo ""
echo "  aws ecr get-login-password --region ${AWS_REGION} | \\"
echo "    docker login --username AWS --password-stdin ${ECR_REGISTRY}"
echo ""
echo "  # Then push (run from project root):"
echo "  ./scripts/push-images-ecr.sh"
echo ""

# Output .env snippet for ECR_REGISTRY
echo "Add this to your .env / GitHub Secrets:"
echo ""
echo "  AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID}"
echo "  ECR_REGISTRY=${ECR_REGISTRY}"
echo ""
