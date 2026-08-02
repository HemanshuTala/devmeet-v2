#!/usr/bin/env bash
# =============================================================================
# DevMeet — Build & Push all Docker images to AWS ECR
# =============================================================================
# Usage:
#   chmod +x scripts/push-images-ecr.sh
#   AWS_REGION=eu-north-1 IMAGE_TAG=latest ./scripts/push-images-ecr.sh
# =============================================================================

set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-north-1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "============================================="
echo " DevMeet — Build & Push to ECR"
echo " Registry : ${ECR_REGISTRY}"
echo " Tag      : ${IMAGE_TAG}"
echo "============================================="
echo ""

# Authenticate Docker with ECR
echo "Authenticating Docker with ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${ECR_REGISTRY}"
echo -e "${GREEN}Authenticated.${NC}"
echo ""

# Map: service-name -> build context path
declare -A SERVICES=(
  ["auth-service"]="services/auth-service"
  ["user-service"]="services/user-service"
  ["orchestrator-service"]="services/orchestrator-service"
  ["ai-interviewer-service"]="services/ai-interviewer-service"
  ["code-execution-service"]="services/code-execution-service"
  ["video-service"]="services/video-service"
  ["feedback-service"]="services/feedback-service"
  ["notification-service"]="services/notification-service"
  ["analytics-service"]="services/analytics-service"
  ["admin-service"]="services/admin-service"
  ["file-service"]="services/file-service"
  ["payment-service"]="services/payment-service"
  ["search-service"]="services/search-service"
  ["api-gateway"]="services/api-gateway"
)

pushed=0
failed=0

for service in "${!SERVICES[@]}"; do
  context="${SERVICES[$service]}"
  ecr_image="${ECR_REGISTRY}/devmeet-${service}:${IMAGE_TAG}"

  echo -n "Building devmeet-${service}... "

  if docker build \
       --platform linux/amd64 \
       -t "${ecr_image}" \
       "${context}" 2>&1 | tail -1; then
    echo -e "${GREEN}built${NC}"
  else
    echo -e "${RED}BUILD FAILED — skipping push${NC}"
    failed=$((failed + 1))
    continue
  fi

  echo -n "Pushing devmeet-${service}... "
  if docker push "${ecr_image}" 2>&1 | tail -2; then
    echo -e "${GREEN}pushed${NC}"
    pushed=$((pushed + 1))
  else
    echo -e "${RED}PUSH FAILED${NC}"
    failed=$((failed + 1))
  fi
  echo ""
done

echo "============================================="
echo " Done: ${pushed} pushed | ${failed} failed"
echo "============================================="
