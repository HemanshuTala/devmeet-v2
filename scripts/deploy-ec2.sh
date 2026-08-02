#!/usr/bin/env bash
# =============================================================================
# DevMeet v2.0 — AWS EC2 Deployment Script
# =============================================================================
# Run this script ON the EC2 instance after SSHing in, OR run it from your
# local machine to bootstrap the EC2 instance remotely.
#
# What it does:
#   1. Installs Docker + Docker Compose + AWS CLI on the EC2 instance
#   2. Authenticates Docker with ECR
#   3. Pulls all images from ECR
#   4. Starts the full stack via docker-compose.prod.yml
#   5. Runs the DB migration
#   6. Checks health of all services
#
# Prerequisites (local machine):
#   - AWS CLI configured with your credentials
#   - EC2 key pair (.pem file)
#   - EC2 instance already launched (see DEPLOYMENT-AWS.md)
#
# Usage:
#   chmod +x scripts/deploy-ec2.sh
#
#   # Deploy to a running EC2 instance:
#   EC2_HOST=<public-ip-or-dns> EC2_KEY=~/.ssh/devmeet.pem ./scripts/deploy-ec2.sh
#
#   # Or run directly ON the EC2 instance (after copying files):
#   AWS_ACCOUNT_ID=<id> IMAGE_TAG=latest ./scripts/deploy-ec2.sh --local
# =============================================================================

set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-north-1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
EC2_USER="${EC2_USER:-ec2-user}"   # Amazon Linux 2023
APP_DIR="${APP_DIR:-/opt/devmeet}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo -e "\n${BLUE}══════════════════════════════════════════${NC}"; echo -e "${BLUE} $1${NC}"; echo -e "${BLUE}══════════════════════════════════════════${NC}"; }

LOCAL_MODE=false
if [[ "${1:-}" == "--local" ]]; then
  LOCAL_MODE=true
fi

# ─────────────────────────────────────────────────────────────────────────────
# If running locally, SSH into EC2 and re-run this script with --local
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$LOCAL_MODE" == false ]]; then
  EC2_HOST="${EC2_HOST:?'EC2_HOST must be set (public IP or DNS of EC2 instance)'}"
  EC2_KEY="${EC2_KEY:?'EC2_KEY must be set (path to .pem key file)'}"
  AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

  section "Copying project files to EC2"
  # Copy only what's needed (no node_modules, no .next, no __pycache__)
  rsync -avz \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.git' \
    --exclude='*.log' \
    -e "ssh -i ${EC2_KEY} -o StrictHostKeyChecking=no" \
    . \
    "${EC2_USER}@${EC2_HOST}:${APP_DIR}/"

  section "Running deployment on EC2"
  ssh -i "${EC2_KEY}" -o StrictHostKeyChecking=no \
    "${EC2_USER}@${EC2_HOST}" \
    "cd ${APP_DIR} && \
     AWS_REGION=${AWS_REGION} \
     AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID} \
     IMAGE_TAG=${IMAGE_TAG} \
     bash scripts/deploy-ec2.sh --local"
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# FROM HERE: running ON the EC2 instance
# ─────────────────────────────────────────────────────────────────────────────
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?'AWS_ACCOUNT_ID must be set'}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

section "Step 1: Install Docker (if not installed)"
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  if command -v dnf &>/dev/null; then
    # Amazon Linux 2023
    dnf install -y docker
    systemctl enable --now docker
    usermod -aG docker "${USER}"
  elif command -v apt-get &>/dev/null; then
    # Ubuntu
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg lsb-release
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
      gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
      https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
    usermod -aG docker "${USER}"
  fi
  info "Docker installed."
else
  info "Docker already installed: $(docker --version)"
fi

section "Step 2: Install Docker Compose plugin (if needed)"
if ! docker compose version &>/dev/null; then
  info "Installing Docker Compose plugin..."
  COMPOSE_VERSION="v2.24.6"
  mkdir -p ~/.docker/cli-plugins
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-$(uname -m)" \
    -o ~/.docker/cli-plugins/docker-compose
  chmod +x ~/.docker/cli-plugins/docker-compose
  info "Docker Compose installed: $(docker compose version)"
else
  info "Docker Compose: $(docker compose version)"
fi

section "Step 3: Install AWS CLI (if needed)"
if ! command -v aws &>/dev/null; then
  info "Installing AWS CLI v2..."
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp/
  /tmp/aws/install
  rm -rf /tmp/awscliv2.zip /tmp/aws
  info "AWS CLI installed: $(aws --version)"
else
  info "AWS CLI: $(aws --version)"
fi

section "Step 4: Authenticate Docker with ECR"
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${ECR_REGISTRY}"
info "ECR authentication successful."

section "Step 5: Pull images from ECR"
SERVICES=(
  "auth-service" "user-service" "orchestrator-service" "ai-interviewer-service"
  "code-execution-service" "video-service" "feedback-service" "notification-service"
  "analytics-service" "admin-service" "file-service" "payment-service"
  "search-service" "api-gateway"
)

for service in "${SERVICES[@]}"; do
  image="${ECR_REGISTRY}/devmeet-${service}:${IMAGE_TAG}"
  info "Pulling ${image}..."
  docker pull "${image}" || warn "Pull failed for ${service} — will use cached image if available"
done

section "Step 6: Start the stack"
cd "${APP_DIR}"

# Export vars needed by docker-compose.prod.yml
export AWS_ACCOUNT_ID
export IMAGE_TAG
export AWS_REGION

# Stop any running containers first (rolling update)
docker compose -f docker-compose.prod.yml down --remove-orphans --timeout 30 || true

# Start fresh
docker compose -f docker-compose.prod.yml up -d --remove-orphans

section "Step 7: Wait for postgres to be ready"
info "Waiting for PostgreSQL..."
until docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_isready -U devmeet -q 2>/dev/null; do
  sleep 2
done
info "PostgreSQL is ready."

section "Step 8: Run database migrations"
info "Applying schema..."
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U devmeet -d devmeet -f /docker-entrypoint-initdb.d/01_init_dev_schema.sql \
  2>/dev/null || info "Schema already applied (idempotent)."

section "Step 9: Health checks"
sleep 10  # give services time to start

ENDPOINTS=(
  "http://localhost:80/health"
  "http://localhost:8001/health"
  "http://localhost:8002/health"
  "http://localhost:8003/health"
  "http://localhost:8004/health"
  "http://localhost:8005/health"
  "http://localhost:8007/health"
  "http://localhost:8009/health"
  "http://localhost:8010/health"
  "http://localhost:8011/health"
  "http://localhost:8012/health"
  "http://localhost:8013/health"
)

all_ok=true
for url in "${ENDPOINTS[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${url}" 2>/dev/null || echo "000")
  if [[ "$status" == "200" ]]; then
    echo -e "  ${GREEN}✓${NC} ${url}"
  else
    echo -e "  ${RED}✗${NC} ${url} (HTTP ${status})"
    all_ok=false
  fi
done

echo ""
if [[ "$all_ok" == true ]]; then
  info "All services healthy. Deployment complete! 🚀"
else
  warn "Some services not yet healthy. Check with:"
  warn "  docker compose -f docker-compose.prod.yml logs --tail=50 <service>"
fi

echo ""
info "Stack running. Useful commands:"
echo "  docker compose -f docker-compose.prod.yml ps"
echo "  docker compose -f docker-compose.prod.yml logs -f <service>"
echo "  docker compose -f docker-compose.prod.yml restart <service>"
echo ""
