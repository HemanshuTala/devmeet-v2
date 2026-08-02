# Deployment Guide

## Prerequisites

- Kubernetes cluster (minikube, EKS, GKE, or AKS)
- kubectl configured
- Docker installed
- Helm (optional)

## Local Development

### Using Docker Compose

1. Start infrastructure services:
```bash
docker-compose up -d postgres redis elasticsearch rabbitmq kafka zookeeper
```

2. Start microservices:
```bash
docker-compose -f docker-compose.services.yml up -d
```

3. Start frontend:
```bash
cd frontend
npm install
npm run dev
```

## Kubernetes Deployment

### 1. Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### 2. Apply Configurations

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
```

### 3. Deploy Infrastructure

```bash
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/redis-deployment.yaml
```

### 4. Deploy Microservices

```bash
kubectl apply -f k8s/auth-service-deployment.yaml
kubectl apply -f k8s/user-service-deployment.yaml
kubectl apply -f k8s/orchestrator-service-deployment.yaml
kubectl apply -f k8s/ai-interviewer-service-deployment.yaml
kubectl apply -f k8s/code-execution-service-deployment.yaml
kubectl apply -f k8s/video-service-deployment.yaml
kubectl apply -f k8s/feedback-service-deployment.yaml
kubectl apply -f k8s/notification-service-deployment.yaml
kubectl apply -f k8s/analytics-service-deployment.yaml
kubectl apply -f k8s/admin-service-deployment.yaml
kubectl apply -f k8s/file-service-deployment.yaml
kubectl apply -f k8s/search-service-deployment.yaml
```

### 5. Verify Deployment

```bash
kubectl get pods -n devmeet
kubectl get services -n devmeet
```

## Environment Variables

Update `k8s/secrets.yaml` with your actual values before deployment.

## Scaling

Services are configured with Horizontal Pod Autoscalers (HPA). Adjust min/max replicas in the deployment YAMLs as needed.

## Monitoring

Access Grafana dashboards for monitoring:
- Service metrics
- AI Interviewer performance
- Code execution queue depth
- Business metrics (DAU/MAU)
