#!/bin/bash
# DevMeet Kubernetes Production Deployment Script
# This script deploys the complete infrastructure with all P2 requirements

set -e

echo "🚀 Starting DevMeet Production Deployment..."

# Configuration
NAMESPACE="devmeet"
KAFKA_NAMESPACE="kafka"
VAULT_NAMESPACE="vault"
KUBECTL="kubectl"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
info "Checking prerequisites..."
command -v kubectl >/dev/null 2>&1 || { error "kubectl is required but not installed. Aborting."; exit 1; }
command -v helm >/dev/null 2>&1 || { warn "helm not found. Some components may require helm."; }

# Function to wait for deployment
wait_for_deployment() {
    local namespace=$1
    local deployment=$2
    info "Waiting for $deployment in namespace $namespace to be ready..."
    $KUBECTL rollout status deployment/$deployment -n $namespace --timeout=300s
}

# Function to wait for statefulset
wait_for_statefulset() {
    local namespace=$1
    local statefulset=$2
    info "Waiting for $statefulset in namespace $namespace to be ready..."
    $KUBECTL rollout status statefulset/$statefulset -n $namespace --timeout=600s
}

# Step 1: Create namespaces
info "Step 1: Creating namespaces..."
$KUBECTL apply -f namespace.yaml
$KUBECTL apply -f kafka-cluster.yaml | grep "namespace" || true
$KUBECTL apply -f vault-deployment.yaml | grep "namespace" || true

# Step 2: Install Istio (if not already installed)
info "Step 2: Installing/Verifying Istio..."
if ! $KUBECTL get namespace istio-system >/dev/null 2>&1; then
    warn "Istio not found. Please install Istio first:"
    echo "  curl -L https://istio.io/downloadIstio | sh -"
    echo "  cd istio-*"
    echo "  export PATH=\$PWD/bin:\$PATH"
    echo "  istioctl install --set profile=production -y"
    echo ""
    read -p "Press enter when Istio is installed, or Ctrl+C to abort..."
else
    info "Istio is already installed"
fi

# Enable Istio injection for devmeet namespace
info "Enabling Istio sidecar injection for $NAMESPACE namespace..."
$KUBECTL label namespace $NAMESPACE istio-injection=enabled --overwrite

# Step 3: Deploy infrastructure secrets
info "Step 3: Deploying secrets and configmaps..."
$KUBECTL apply -f secrets.yaml
$KUBECTL apply -f configmap.yaml

# Step 4: Deploy HashiCorp Vault
info "Step 4: Deploying HashiCorp Vault..."
$KUBECTL apply -f vault-deployment.yaml
sleep 10
wait_for_statefulset $VAULT_NAMESPACE vault
info "Vault deployed. Remember to initialize and unseal Vault manually!"
warn "Run: kubectl exec -n vault vault-0 -- vault operator init"

# Step 5: Deploy Kafka cluster
info "Step 5: Deploying Kafka cluster with Zookeeper..."
$KUBECTL apply -f kafka-cluster.yaml
sleep 15
info "Waiting for Zookeeper..."
wait_for_statefulset $KAFKA_NAMESPACE zookeeper
sleep 10
info "Waiting for Kafka..."
wait_for_statefulset $KAFKA_NAMESPACE kafka
info "Creating Kafka topics..."
$KUBECTL apply -f kafka-cluster.yaml | grep "Job" || true
sleep 5

# Step 6: Deploy RabbitMQ cluster with durable queues
info "Step 6: Deploying RabbitMQ cluster..."
$KUBECTL apply -f rabbitmq-cluster.yaml
sleep 10
wait_for_statefulset $NAMESPACE rabbitmq
info "RabbitMQ cluster deployed with durable queues and DLQs"

# Step 7: Deploy Elasticsearch cluster
info "Step 7: Deploying Elasticsearch cluster..."
$KUBECTL apply -f elasticsearch-cluster.yaml
sleep 15
wait_for_statefulset $NAMESPACE elasticsearch
info "Initializing Elasticsearch indices..."
$KUBECTL wait --for=condition=complete job/elasticsearch-init -n $NAMESPACE --timeout=300s || warn "ES init job may have failed"

# Step 8: Deploy databases (PostgreSQL and Redis)
info "Step 8: Deploying databases..."
$KUBECTL apply -f postgres-deployment.yaml
$KUBECTL apply -f redis-deployment.yaml
sleep 10
wait_for_statefulset $NAMESPACE postgres
wait_for_deployment $NAMESPACE redis

# Step 9: Deploy all microservices
info "Step 9: Deploying microservices..."
for service in auth user orchestrator ai-interviewer code-execution video feedback notification analytics admin file payment search; do
    info "Deploying ${service}-service..."
    $KUBECTL apply -f ${service}-service-deployment.yaml
done

# Wait for services to be ready
sleep 15
for service in auth user orchestrator ai-interviewer video feedback notification analytics admin file payment search; do
    wait_for_deployment $NAMESPACE ${service}-service || warn "${service}-service may have issues"
done

# Step 10: Deploy HPA for all services
info "Step 10: Deploying Horizontal Pod Autoscalers..."
$KUBECTL apply -f hpa-all-services.yaml

# Step 11: Deploy Istio Gateway and Virtual Services
info "Step 11: Deploying Istio Gateway and mTLS configuration..."
$KUBECTL apply -f istio-gateway.yaml
info "Istio Gateway deployed with strict mTLS enabled"

# Step 12: Deploy monitoring stack
info "Step 12: Deploying Prometheus, Grafana, and AlertManager..."
$KUBECTL apply -f monitoring/prometheus-deployment.yaml
$KUBECTL apply -f monitoring/prometheus-config.yaml
$KUBECTL apply -f monitoring/prometheus-rules.yaml
$KUBECTL apply -f monitoring/alertmanager-config.yaml
$KUBECTL apply -f monitoring/grafana-deployment.yaml
$KUBECTL apply -f monitoring/grafana-config.yaml
$KUBECTL apply -f monitoring/grafana-dashboards-config.yaml
$KUBECTL apply -f monitoring/grafana-dashboard-slo.yaml

sleep 10
wait_for_deployment $NAMESPACE prometheus || warn "Prometheus may have issues"
wait_for_deployment $NAMESPACE grafana || warn "Grafana may have issues"
wait_for_deployment $NAMESPACE alertmanager || warn "AlertManager may have issues"

# Step 13: Verify deployment
info "Step 13: Verifying deployment..."
echo ""
info "=== Deployment Status ==="
echo ""
info "Namespaces:"
$KUBECTL get namespaces | grep -E "(devmeet|kafka|vault)"
echo ""
info "Pods in $NAMESPACE:"
$KUBECTL get pods -n $NAMESPACE
echo ""
info "Services in $NAMESPACE:"
$KUBECTL get svc -n $NAMESPACE
echo ""
info "HPAs:"
$KUBECTL get hpa -n $NAMESPACE
echo ""
info "Istio Gateway:"
$KUBECTL get gateway -n $NAMESPACE
echo ""
info "Kafka pods:"
$KUBECTL get pods -n $KAFKA_NAMESPACE
echo ""
info "Vault status:"
$KUBECTL get pods -n $VAULT_NAMESPACE

# Step 14: Get access endpoints
echo ""
info "=== Access Endpoints ==="
echo ""
INGRESS_HOST=$(kubectl -n istio-system get service istio-ingressgateway -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
if [ -z "$INGRESS_HOST" ]; then
    INGRESS_HOST=$(kubectl -n istio-system get service istio-ingressgateway -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
fi
if [ -z "$INGRESS_HOST" ]; then
    warn "Could not determine Istio Ingress IP/Hostname. Using localhost for port-forward."
    info "To access services via port-forward:"
    echo "  kubectl port-forward -n devmeet svc/grafana 3000:3000"
    echo "  kubectl port-forward -n devmeet svc/prometheus 9090:9090"
    echo "  kubectl port-forward -n devmeet svc/kibana 5601:5601"
    echo "  kubectl port-forward -n devmeet svc/rabbitmq-client 15672:15672"
else
    info "Istio Ingress: https://$INGRESS_HOST"
    info "API Gateway: https://$INGRESS_HOST/api/v1"
fi

echo ""
info "Grafana: kubectl port-forward -n devmeet svc/grafana 3000:3000"
info "  Username: admin / Password: (from grafana secret)"
echo ""
info "Prometheus: kubectl port-forward -n devmeet svc/prometheus 9090:9090"
echo ""
info "AlertManager: kubectl port-forward -n devmeet svc/alertmanager 9093:9093"
echo ""
info "Kibana: kubectl port-forward -n devmeet svc/kibana 5601:5601"
echo ""
info "RabbitMQ Management: kubectl port-forward -n devmeet svc/rabbitmq-client 15672:15672"
info "  Username/Password: admin/changeme-in-production"
echo ""
info "Vault: kubectl port-forward -n vault svc/vault 8200:8200"
warn "  IMPORTANT: Initialize and unseal Vault:"
echo "  export VAULT_ADDR='https://localhost:8200'"
echo "  export VAULT_SKIP_VERIFY=true"
echo "  kubectl exec -n vault vault-0 -- vault operator init"
echo ""

# Post-deployment checks
info "=== Post-Deployment Checklist ==="
echo ""
warn "1. Initialize and unseal Vault (see instructions above)"
warn "2. Configure Vault secrets for microservices"
warn "3. Update TLS certificates in istio-gateway (replace self-signed certs)"
warn "4. Configure AlertManager webhooks (Slack, PagerDuty, email)"
warn "5. Configure Elasticsearch passwords (change default)"
warn "6. Configure RabbitMQ passwords (change default)"
warn "7. Verify all HPA metrics are available (metrics-server required)"
warn "8. Set up external DNS for Istio Ingress"
warn "9. Configure backup jobs for databases"
warn "10. Set up log aggregation (if using external logging)"
echo ""

info "✅ Deployment complete!"
echo ""
info "To check SLO metrics:"
echo "  kubectl port-forward -n devmeet svc/grafana 3000:3000"
echo "  Open http://localhost:3000 and navigate to 'DevMeet SLO Dashboard'"
echo ""
info "To view active alerts:"
echo "  kubectl port-forward -n devmeet svc/prometheus 9090:9090"
echo "  Open http://localhost:9090/alerts"
echo ""
info "For troubleshooting:"
echo "  kubectl logs -n devmeet <pod-name> -f"
echo "  kubectl describe pod -n devmeet <pod-name>"
echo "  kubectl get events -n devmeet --sort-by='.lastTimestamp'"
