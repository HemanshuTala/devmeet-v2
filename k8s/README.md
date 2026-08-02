# DevMeet Kubernetes Infrastructure

This directory contains the complete Kubernetes infrastructure for DevMeet, implementing all P2 requirements from the SRS v2.0.

## 📋 Overview

The infrastructure includes:

- **Kubernetes manifests** for all 13 microservices
- **HPA (Horizontal Pod Autoscaler)** for automatic scaling to handle 500+ concurrent sessions
- **Istio service mesh** with strict mTLS for secure service-to-service communication
- **Kafka event bus** (3-node cluster) for asynchronous event processing
- **RabbitMQ cluster** (3 nodes) with durable queues and Dead Letter Queues (DLQ)
- **HashiCorp Vault** for centralized secrets management
- **Prometheus + Grafana + AlertManager** for SLO monitoring and alerting
- **Elasticsearch cluster** (3 nodes) for question bank and analytics
- **PostgreSQL** and **Redis** for data persistence

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Istio Ingress Gateway                    │
│                    (TLS 1.3, mTLS, HTTPS)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Istio Service Mesh (mTLS)                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Microservices (with HPA)                           │    │
│  │  • Auth Service (2-10 pods)                         │    │
│  │  • User Service (2-10 pods)                         │    │
│  │  • Orchestrator Service (3-20 pods)                 │    │
│  │  • AI Interviewer Service (3-25 pods)               │    │
│  │  • Code Execution Service (2-15 pods)               │    │
│  │  • Video Service (2-12 pods)                        │    │
│  │  • Feedback Service (2-12 pods)                     │    │
│  │  • Notification Service (2-8 pods)                  │    │
│  │  • Analytics Service (2-10 pods)                    │    │
│  │  • Admin Service (1-5 pods)                         │    │
│  │  • File Service (2-10 pods)                         │    │
│  │  • Payment Service (2-8 pods)                       │    │
│  │  • Search Service (2-8 pods)                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼───┐       ┌────▼───┐      ┌────▼────┐
   │ Kafka  │       │RabbitMQ│      │  Vault  │
   │3 nodes │       │3 nodes │      │         │
   └────┬───┘       └────┬───┘      └─────────┘
        │                │
   ┌────▼─────────┬──────▼──────┬──────────────┐
   │ PostgreSQL   │    Redis    │Elasticsearch │
   │              │             │   3 nodes    │
   └──────────────┴─────────────┴──────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐     ┌─────▼────┐    ┌─────▼─────┐
   │Prometheus│     │ Grafana  │    │AlertManager│
   │  + Rules │     │Dashboards│    │  + PD     │
   └──────────┘     └──────────┘    └───────────┘
```

## 🚀 Quick Start

### Prerequisites

1. **Kubernetes cluster** (1.27+) with:
   - At least 3 worker nodes (for HA)
   - Minimum 32GB RAM per node
   - 100GB storage per node
   - LoadBalancer support (for Istio Ingress)

2. **Tools installed**:
   ```bash
   kubectl version --client
   helm version
   istioctl version
   ```

3. **Istio installed**:
   ```bash
   curl -L https://istio.io/downloadIstio | sh -
   cd istio-*
   export PATH=$PWD/bin:$PATH
   istioctl install --set profile=production -y
   ```

4. **Metrics Server** (for HPA):
   ```bash
   kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
   ```

### Deployment

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd k8s
   ```

2. **Update secrets**:
   Edit `secrets.yaml` and replace placeholder values with real credentials:
   - JWT_SECRET_KEY
   - GROQ_API_KEY
   - AWS credentials
   - Database passwords
   - LiveKit credentials

3. **Run deployment script**:
   ```bash
   chmod +x deploy-all.sh
   ./deploy-all.sh
   ```

4. **Verify deployment**:
   ```bash
   kubectl get pods -n devmeet
   kubectl get hpa -n devmeet
   kubectl get gateway -n devmeet
   ```

### Manual Deployment (Step-by-Step)

If you prefer manual deployment:

```bash
# 1. Create namespaces
kubectl apply -f namespace.yaml
kubectl apply -f kafka-cluster.yaml  # Creates kafka namespace
kubectl apply -f vault-deployment.yaml  # Creates vault namespace

# 2. Enable Istio injection
kubectl label namespace devmeet istio-injection=enabled

# 3. Deploy secrets and config
kubectl apply -f secrets.yaml
kubectl apply -f configmap.yaml

# 4. Deploy infrastructure
kubectl apply -f vault-deployment.yaml
kubectl apply -f kafka-cluster.yaml
kubectl apply -f rabbitmq-cluster.yaml
kubectl apply -f elasticsearch-cluster.yaml
kubectl apply -f postgres-deployment.yaml
kubectl apply -f redis-deployment.yaml

# 5. Deploy microservices
kubectl apply -f auth-service-deployment.yaml
kubectl apply -f user-service-deployment.yaml
kubectl apply -f orchestrator-service-deployment.yaml
kubectl apply -f ai-interviewer-service-deployment.yaml
kubectl apply -f code-execution-service-deployment.yaml
kubectl apply -f video-service-deployment.yaml
kubectl apply -f feedback-service-deployment.yaml
kubectl apply -f notification-service-deployment.yaml
kubectl apply -f analytics-service-deployment.yaml
kubectl apply -f admin-service-deployment.yaml
kubectl apply -f file-service-deployment.yaml
kubectl apply -f payment-service-deployment.yaml
kubectl apply -f search-service-deployment.yaml

# 6. Deploy HPA
kubectl apply -f hpa-all-services.yaml

# 7. Deploy Istio Gateway
kubectl apply -f istio-gateway.yaml

# 8. Deploy monitoring
kubectl apply -f monitoring/
```

## 📊 Monitoring & Observability

### SLO Dashboards

Access Grafana:
```bash
kubectl port-forward -n devmeet svc/grafana 3000:3000
```
Open http://localhost:3000 (admin/admin)

**Key SLO Metrics**:
- API Availability: 99.5% target
- API Latency P95: < 500ms target
- API Latency P99: < 2s target
- AI Response Time: < 5s target
- Code Execution Time: < 10s target
- Interview Success Rate: > 90% target

### Alerting

AlertManager is configured with:
- **Slack** integration for real-time alerts
- **PagerDuty** for critical incidents
- **Email** for SLO violations

Configure webhooks in `monitoring/alertmanager-config.yaml`.

### Prometheus Queries

Access Prometheus:
```bash
kubectl port-forward -n devmeet svc/prometheus 9090:9090
```

**Example queries**:
```promql
# API success rate
devmeet:api:success_rate:5m

# API latency P95
devmeet:api:latency:p95:5m

# Error rate by service
sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)

# Active sessions
interview_sessions_active
```

## 🔒 Security

### mTLS Configuration

Istio enforces **strict mTLS** between all services:
```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: devmeet
spec:
  mtls:
    mode: STRICT
```

### Secrets Management

HashiCorp Vault stores all sensitive data:

1. **Initialize Vault**:
```bash
kubectl exec -n vault vault-0 -- vault operator init
```

2. **Unseal Vault** (use keys from init):
```bash
kubectl exec -n vault vault-0 -- vault operator unseal <key1>
kubectl exec -n vault vault-0 -- vault operator unseal <key2>
kubectl exec -n vault vault-0 -- vault operator unseal <key3>
```

3. **Store secrets**:
```bash
export VAULT_ADDR='https://localhost:8200'
kubectl port-forward -n vault svc/vault 8200:8200

vault login <root-token>
vault kv put secret/devmeet/jwt secret_key="<secret>"
vault kv put secret/devmeet/groq api_key="<key>"
vault kv put secret/devmeet/aws access_key_id="<key>" secret_access_key="<secret>"
```

### TLS Certificates

Replace self-signed certificates with production certs:

1. **Using cert-manager** (recommended):
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@devmeet.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: istio
EOF
```

2. **Update Gateway** to use cert-manager certificate:
```yaml
spec:
  servers:
  - port:
      number: 443
      name: https
      protocol: HTTPS
    tls:
      mode: SIMPLE
      credentialName: devmeet-tls-cert  # Created by cert-manager
```

## 🔄 Event-Driven Architecture

### Kafka Topics

The system uses Kafka for event streaming:

| Topic | Partitions | Purpose |
|-------|-----------|---------|
| `interview.sessions.created` | 6 | New session events |
| `interview.sessions.completed` | 6 | Completed sessions |
| `interview.questions.asked` | 12 | Question tracking |
| `interview.code.executed` | 12 | Code execution events |
| `interview.feedback.generated` | 6 | Feedback ready |
| `user.actions` | 6 | User activity tracking |
| `analytics.events` | 12 | Analytics aggregation |
| `notifications.send` | 6 | Notification requests |
| `payments.events` | 3 | Payment transactions |
| `audit.logs` | 3 | Audit trail |

**Access Kafka**:
```bash
kubectl exec -n kafka kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --list
kubectl exec -n kafka kafka-0 -- kafka-console-consumer --bootstrap-server localhost:9092 --topic interview.sessions.created --from-beginning
```

### RabbitMQ Queues

Durable queues with DLQ for reliable processing:

| Queue | Purpose | DLQ |
|-------|---------|-----|
| `code_execution` | Async code runs | `code_execution.dlq` |
| `feedback_generation` | Feedback jobs | `feedback_generation.dlq` |
| `notifications` | Email/SMS | `notifications.dlq` |
| `email_notifications` | Bulk emails | `email_notifications.dlq` |

**Access RabbitMQ Management**:
```bash
kubectl port-forward -n devmeet svc/rabbitmq-client 15672:15672
```
Open http://localhost:15672 (admin/changeme-in-production)

## 📈 Scaling

### Horizontal Pod Autoscaling

HPA automatically scales services based on CPU/memory:

```bash
# View HPA status
kubectl get hpa -n devmeet

# Example output:
# NAME                          REFERENCE                        TARGETS         MINPODS   MAXPODS   REPLICAS
# ai-interviewer-service-hpa    Deployment/ai-interviewer-svc    45%/70%         3         25        5
# orchestrator-service-hpa      Deployment/orchestrator-service  60%/65%         3         20        8
```

### Manual Scaling

Scale a specific service:
```bash
kubectl scale deployment ai-interviewer-service -n devmeet --replicas=10
```

### Cluster Autoscaling

For cloud providers, enable cluster autoscaler to add nodes:

**AWS**:
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml
```

## 🔍 Troubleshooting

### Common Issues

1. **Pods not starting**:
```bash
kubectl describe pod <pod-name> -n devmeet
kubectl logs <pod-name> -n devmeet -f
```

2. **HPA not scaling**:
```bash
# Check metrics-server
kubectl top nodes
kubectl top pods -n devmeet

# Check HPA events
kubectl describe hpa <hpa-name> -n devmeet
```

3. **Services can't communicate**:
```bash
# Check Istio sidecar injection
kubectl get pod <pod-name> -n devmeet -o jsonpath='{.spec.containers[*].name}'
# Should show: <service-name> istio-proxy

# Check mTLS status
istioctl proxy-status
```

4. **Kafka not working**:
```bash
# Check Kafka broker status
kubectl exec -n kafka kafka-0 -- kafka-broker-api-versions --bootstrap-server localhost:9092

# Check Zookeeper
kubectl exec -n kafka zookeeper-0 -- zkCli.sh ls /brokers/ids
```

5. **Vault sealed**:
```bash
kubectl exec -n vault vault-0 -- vault status
kubectl exec -n vault vault-0 -- vault operator unseal <key>
```

### Debug Commands

```bash
# Get all resources in namespace
kubectl get all -n devmeet

# Check recent events
kubectl get events -n devmeet --sort-by='.lastTimestamp' | tail -20

# Check resource usage
kubectl top pods -n devmeet --sort-by=memory
kubectl top nodes

# Check network policies
kubectl get networkpolicies -n devmeet

# Check Istio configuration
istioctl analyze -n devmeet

# Check service endpoints
kubectl get endpoints -n devmeet
```

## 🔄 Updates & Rollbacks

### Rolling Updates

Update a service:
```bash
kubectl set image deployment/auth-service auth-service=devmeet/auth-service:v2.1.0 -n devmeet
```

### Rollback

Rollback to previous version:
```bash
kubectl rollout undo deployment/auth-service -n devmeet
kubectl rollout history deployment/auth-service -n devmeet
kubectl rollout undo deployment/auth-service --to-revision=2 -n devmeet
```

## 💾 Backup & Restore

### Database Backups

Create CronJob for PostgreSQL backups:
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: devmeet
spec:
  schedule: "0 2 * * *"  # 2 AM daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:16
            command:
            - /bin/sh
            - -c
            - |
              pg_dump -h postgres -U devmeet devmeet | gzip > /backup/devmeet-$(date +%Y%m%d-%H%M%S).sql.gz
              # Upload to S3
              aws s3 cp /backup/devmeet-*.sql.gz s3://devmeet-backups/postgres/
            volumeMounts:
            - name: backup
              mountPath: /backup
          volumes:
          - name: backup
            emptyDir: {}
          restartPolicy: OnFailure
```

### Redis Persistence

Redis uses RDB snapshots + AOF for persistence (configured in deployment).

### Elasticsearch Snapshots

Configure snapshot repository:
```bash
curl -X PUT "localhost:9200/_snapshot/devmeet_backup" -H 'Content-Type: application/json' -d'
{
  "type": "s3",
  "settings": {
    "bucket": "devmeet-es-backups",
    "region": "us-east-1"
  }
}
'

# Create snapshot
curl -X PUT "localhost:9200/_snapshot/devmeet_backup/snapshot_$(date +%Y%m%d)"
```

## 📝 SRS v2.0 Compliance

This infrastructure implements all P2 requirements:

✅ **Kubernetes manifests** with proper resource limits and requests  
✅ **HPA** for scaling to 500+ concurrent sessions  
✅ **Istio mTLS** for service-to-service encryption  
✅ **Kafka event bus** (3-node, 10 topics)  
✅ **RabbitMQ durable queues** with DLQ  
✅ **HashiCorp Vault** for secrets management  
✅ **Prometheus + Grafana** with SLO dashboards  
✅ **AlertManager** with Slack/PagerDuty integration  
✅ **Elasticsearch** (3-node) for question bank  

## 🤝 Contributing

When adding new services:

1. Create deployment YAML in `k8s/`
2. Add HPA configuration to `hpa-all-services.yaml`
3. Add routes to `istio-gateway.yaml`
4. Add Prometheus metrics scraping
5. Update this README

## 📧 Support

For infrastructure issues:
- Slack: #devmeet-infra
- Email: infra@devmeet.com
- On-call: PagerDuty rotation
