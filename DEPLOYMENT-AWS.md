# DevMeet v2.0 — AWS Deployment Guide

Region: **eu-north-1 (Stockholm)**  
AWS Account: configured in `.env`  
S3 Bucket: `aakruti-s3`

---

## Two Deployment Options

| | **Option A: EC2 + Docker Compose** | **Option B: EKS + Kubernetes** |
|---|---|---|
| Complexity | Low | High |
| Cost (est.) | ~$80–150/month | ~$300–600/month |
| Best for | MVP, staging, small load | Production scale, auto-scaling |
| Time to deploy | ~30 min | ~2–3 hours |
| Managed infra | You manage everything | AWS manages the control plane |

**Recommendation:** Start with Option A (EC2) to validate the deployment, then migrate to Option B (EKS) when you need scaling.

---

## Pre-Deployment Checklist

Before deploying, confirm these are done:

- [ ] `.env` file is fully filled in (check yours — it already is ✅)
- [ ] AWS credentials are active and have required permissions
- [ ] SES email `hemansutala8@gmail.com` is verified in AWS SES eu-north-1
- [ ] S3 bucket `aakruti-s3` exists in eu-north-1
- [ ] ECR repositories created (run `scripts/setup-ecr.sh`)
- [ ] Docker images built and pushed to ECR (run `scripts/push-images-ecr.sh`)

---

## Required AWS IAM Permissions

Your IAM user/role needs these policies:

```
AmazonEC2FullAccess          (or targeted EC2 permissions)
AmazonECR-FullAccess
AmazonS3FullAccess           (scoped to aakruti-s3)
AmazonSESFullAccess          (scoped to eu-north-1)
AmazonEKSClusterPolicy       (Option B only)
AmazonEKSWorkerNodePolicy    (Option B only)
```

---

## Step 0: Create ECR Repositories

Run this once to create all 14 ECR repos:

```bash
# On your local machine (with AWS CLI configured)
cd "E:\AI INTERVIEW"
chmod +x scripts/setup-ecr.sh
AWS_REGION=eu-north-1 bash scripts/setup-ecr.sh
```

Then build and push all images:

```bash
# Build for Linux (required even if you're on Windows/Mac)
AWS_REGION=eu-north-1 IMAGE_TAG=latest bash scripts/push-images-ecr.sh
```

> **Windows users:** Run these commands in WSL2 or Git Bash. Docker must be running.

---

## Option A: EC2 + Docker Compose (Recommended for start)

### Step 1: Launch EC2 Instance

**Recommended instance type:** `t3.2xlarge` (8 vCPU, 32GB RAM)
- 13 microservices + infra (postgres, redis, rabbitmq, kafka, elasticsearch) need at least 16GB
- `t3.xlarge` (16GB) works for testing but will be tight

**Via AWS Console:**

1. Go to EC2 → Launch Instance
2. **AMI:** Amazon Linux 2023 (x86_64)
3. **Instance type:** `t3.2xlarge`
4. **Key pair:** Create new → `devmeet-key` → download `.pem`
5. **Security group:** Create new `devmeet-sg` with these inbound rules:

   | Port | Protocol | Source | Purpose |
   |------|----------|--------|---------|
   | 22 | TCP | Your IP | SSH |
   | 80 | TCP | 0.0.0.0/0 | HTTP (API Gateway) |
   | 443 | TCP | 0.0.0.0/0 | HTTPS (if you add TLS) |

6. **Storage:** 50 GB gp3
7. Launch

**Via AWS CLI:**

```bash
# Create security group
aws ec2 create-security-group \
  --group-name devmeet-sg \
  --description "DevMeet production security group" \
  --region eu-north-1

SG_ID=$(aws ec2 describe-security-groups \
  --group-names devmeet-sg \
  --region eu-north-1 \
  --query 'SecurityGroups[0].GroupId' --output text)

# Allow SSH from your IP
MY_IP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 22 \
  --cidr ${MY_IP}/32 \
  --region eu-north-1

# Allow HTTP/HTTPS from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 80 \
  --cidr 0.0.0.0/0 \
  --region eu-north-1

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 443 \
  --cidr 0.0.0.0/0 \
  --region eu-north-1

# Launch instance
aws ec2 run-instances \
  --image-id ami-0c1ac8728ef7f3767 \
  --instance-type t3.2xlarge \
  --key-name devmeet-key \
  --security-group-ids $SG_ID \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":50,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=devmeet-prod}]' \
  --iam-instance-profile Name=devmeet-ec2-role \
  --region eu-north-1 \
  --count 1
```

### Step 2: Attach EC2 IAM Role (for ECR access without hardcoding keys)

Create an instance profile so the EC2 instance can pull from ECR automatically:

```bash
# Create the role
aws iam create-role \
  --role-name devmeet-ec2-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach ECR + S3 + SES permissions
aws iam attach-role-policy \
  --role-name devmeet-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

aws iam attach-role-policy \
  --role-name devmeet-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Create instance profile
aws iam create-instance-profile --instance-profile-name devmeet-ec2-profile
aws iam add-role-to-instance-profile \
  --instance-profile-name devmeet-ec2-profile \
  --role-name devmeet-ec2-role
```

### Step 3: Deploy the Application

Get the instance's public IP:

```bash
EC2_IP=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=devmeet-prod" "Name=instance-state-name,Values=running" \
  --region eu-north-1 \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

echo "EC2 IP: ${EC2_IP}"
```

Run the deployment script:

```bash
# From E:\AI INTERVIEW (use Git Bash or WSL2 on Windows)
EC2_HOST=$EC2_IP \
EC2_KEY=~/.ssh/devmeet-key.pem \
AWS_REGION=eu-north-1 \
IMAGE_TAG=latest \
bash scripts/deploy-ec2.sh
```

This will:
1. Copy the project files to EC2 via rsync
2. Install Docker + AWS CLI on the EC2 instance
3. Pull all images from ECR
4. Start the full stack with `docker-compose.prod.yml`
5. Run database migrations
6. Run health checks on all 13 services

### Step 4: Verify

```bash
# SSH in and check
ssh -i ~/.ssh/devmeet-key.pem ec2-user@$EC2_IP

# On the EC2 instance:
cd /opt/devmeet
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=20 auth-service
```

API Gateway should be at: `http://<EC2_IP>/health`

---

## Option B: EKS (Kubernetes)

### Step 1: Create EKS Cluster

```bash
# Install eksctl if not already installed
curl --silent --location "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# Create the cluster (takes ~20 minutes)
eksctl create cluster \
  --name devmeet-cluster \
  --region eu-north-1 \
  --node-type t3.xlarge \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 6 \
  --managed \
  --with-oidc \
  --ssh-access \
  --ssh-public-key devmeet-key
```

### Step 2: Install EBS CSI Driver (for Postgres PVC with gp3)

```bash
# The postgres-deployment.yaml uses storageClassName: gp3
# This requires the EBS CSI driver on EKS

aws eks create-addon \
  --cluster-name devmeet-cluster \
  --addon-name aws-ebs-csi-driver \
  --region eu-north-1

# Create gp3 StorageClass
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
reclaimPolicy: Retain
EOF
```

### Step 3: Update k8s deployments to use your ECR registry

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.eu-north-1.amazonaws.com"

# Patch all deployment YAMLs to point at your ECR (run from k8s/ directory)
for f in k8s/*-deployment.yaml; do
  service=$(basename $f | sed 's/-deployment.yaml//')
  sed -i "s|image: devmeet/${service}:latest|image: ${ECR_REGISTRY}/devmeet-${service}:latest|g" "$f"
done
```

### Step 4: Allow EKS nodes to pull from ECR

```bash
# Attach ECR read policy to node IAM role
NODE_ROLE=$(aws eks describe-nodegroup \
  --cluster-name devmeet-cluster \
  --nodegroup-name ng-1 \
  --region eu-north-1 \
  --query 'nodegroup.nodeRole' --output text | awk -F'/' '{print $NF}')

aws iam attach-role-policy \
  --role-name $NODE_ROLE \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
```

### Step 5: Deploy to EKS

```bash
cd "E:\AI INTERVIEW"
bash k8s/deploy-all.sh
```

Or step-by-step:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/rabbitmq-cluster.yaml
kubectl apply -f k8s/kafka-cluster.yaml
kubectl apply -f k8s/elasticsearch-cluster.yaml

# Wait for infra to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n devmeet --timeout=120s

# Deploy all microservices
for f in k8s/auth-service-deployment.yaml \
         k8s/user-service-deployment.yaml \
         k8s/orchestrator-service-deployment.yaml \
         k8s/ai-interviewer-service-deployment.yaml \
         k8s/code-execution-service-deployment.yaml \
         k8s/video-service-deployment.yaml \
         k8s/feedback-service-deployment.yaml \
         k8s/notification-service-deployment.yaml \
         k8s/analytics-service-deployment.yaml \
         k8s/admin-service-deployment.yaml \
         k8s/file-service-deployment.yaml \
         k8s/payment-service-deployment.yaml \
         k8s/search-service-deployment.yaml \
         k8s/api-gateway-deployment.yaml; do
  kubectl apply -f $f
done

kubectl apply -f k8s/hpa-all-services.yaml
kubectl apply -f k8s/monitoring/
```

### Step 6: Verify EKS Deployment

```bash
kubectl get pods -n devmeet
kubectl get svc -n devmeet
kubectl get hpa -n devmeet

# Check logs for a specific service
kubectl logs -n devmeet -l app=auth-service --tail=50
```

---

## CI/CD: Automatic Deploys via GitHub Actions

The `.github/workflows/ci-cd.yml` pipeline is now fully configured. Add these GitHub Secrets:

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | Your IAM access key ID (from AWS Console → IAM → Security credentials) |
| `AWS_SECRET_ACCESS_KEY` | Your IAM secret access key |
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID (`aws sts get-caller-identity --query Account`) |

For EKS deploys, the CI/CD uses `aws eks update-kubeconfig` automatically — no `KUBE_CONFIG` secret needed.

**Pipeline flow:**
```
push to main
  → test all 14 services in parallel
  → build & push 14 Docker images to ECR (parallel, one job per image)
  → deploy to EKS (kubectl apply all manifests)
  → wait for rollouts
  → verify health
```

---

## AWS SES Setup (Email)

SES is in sandbox mode by default — you can only send to verified addresses.

To send to any address (production):

```bash
# Request production access
aws ses put-account-sending-attributes \
  --sending-enabled \
  --region eu-north-1

# Verify your from-address (already should be done)
aws ses verify-email-identity \
  --email-address hemansutala8@gmail.com \
  --region eu-north-1
```

---

## S3 Bucket CORS (for file uploads from browser)

```bash
aws s3api put-bucket-cors \
  --bucket aakruti-s3 \
  --region eu-north-1 \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["*"],
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "MaxAgeSeconds": 3000
    }]
  }'
```

---

## Cost Estimate (eu-north-1)

### Option A: EC2 + Docker Compose

| Resource | Type | Monthly |
|----------|------|---------|
| EC2 instance | t3.2xlarge | ~$80 |
| EBS storage | 50 GB gp3 | ~$5 |
| S3 (aakruti-s3) | ~10 GB + requests | ~$3 |
| SES | ~1000 emails | ~$0.10 |
| Data transfer | ~50 GB out | ~$5 |
| **Total** | | **~$93/month** |

### Option B: EKS

| Resource | Type | Monthly |
|----------|------|---------|
| EKS cluster | Control plane | $73 |
| EC2 nodes | 3x t3.xlarge | ~$150 |
| EBS (PVC) | 20 GB gp3 | ~$2 |
| ALB | Load balancer | ~$20 |
| S3 | Same as above | ~$3 |
| ECR | 14 repos, ~5 GB | ~$5 |
| **Total** | | **~$253/month** |

---

## Troubleshooting

**Services can't reach postgres/redis:**
- Make sure they're on the same Docker network (`devmeet_net`)
- Check `docker compose -f docker-compose.prod.yml ps` — are postgres/redis healthy?

**code-execution-service can't run Docker containers:**
- On EC2: the socket `/var/run/docker.sock` must exist. Run `ls -la /var/run/docker.sock`
- The service runs as `root` in production — this is intentional for Docker socket access
- The service has a full CLI fallback — check logs: `docker compose logs code-execution-service`

**ECR pull fails (403):**
- Re-authenticate: `aws ecr get-login-password --region eu-north-1 | docker login --username AWS --password-stdin <ecr-registry>`
- Check EC2 IAM role has `AmazonEC2ContainerRegistryReadOnly`

**Postgres PVC stuck in Pending (EKS):**
- Make sure EBS CSI driver is installed and `gp3` StorageClass exists
- Run: `kubectl describe pvc postgres-pvc -n devmeet`

**SES emails not sending:**
- Confirm the from-address `hemansutala8@gmail.com` is verified in SES eu-north-1
- Check if SES account is still in sandbox (can only send to verified addresses)
#   T r i g g e r   C I / C D   w i t h   u p d a t e d   c r e d e n t i a l s   -   0 8 / 0 8 / 2 0 2 6   1 8 : 5 6 : 0 2  
 #   T r i g g e r   C I / C D   t o   r e b u i l d   a p i - g a t e w a y   w i t h   C O R S   f i x   -   0 8 / 0 8 / 2 0 2 6   1 9 : 3 7 : 2 2  
 