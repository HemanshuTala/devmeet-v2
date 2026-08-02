# DevMeet Kubernetes Production Deployment Script (PowerShell)
# This script deploys the complete infrastructure with all P2 requirements

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting DevMeet Production Deployment..." -ForegroundColor Green

# Configuration
$NAMESPACE = "devmeet"
$KAFKA_NAMESPACE = "kafka"
$VAULT_NAMESPACE = "vault"

# Functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Wait-ForDeployment {
    param(
        [string]$Namespace,
        [string]$Deployment
    )
    Write-Info "Waiting for $Deployment in namespace $Namespace to be ready..."
    kubectl rollout status deployment/$Deployment -n $Namespace --timeout=300s
}

function Wait-ForStatefulSet {
    param(
        [string]$Namespace,
        [string]$StatefulSet
    )
    Write-Info "Waiting for $StatefulSet in namespace $Namespace to be ready..."
    kubectl rollout status statefulset/$StatefulSet -n $Namespace --timeout=600s
}

# Check prerequisites
Write-Info "Checking prerequisites..."

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Error-Custom "kubectl is required but not installed. Aborting."
    exit 1
}

if (-not (Get-Command helm -ErrorAction SilentlyContinue)) {
    Write-Warn "helm not found. Some components may require helm."
}

# Step 1: Create namespaces
Write-Info "Step 1: Creating namespaces..."
kubectl apply -f namespace.yaml
kubectl apply -f kafka-cluster.yaml | Select-String "namespace" -ErrorAction SilentlyContinue
kubectl apply -f vault-deployment.yaml | Select-String "namespace" -ErrorAction SilentlyContinue

# Step 2: Install Istio
Write-Info "Step 2: Installing/Verifying Istio..."
$istioNamespace = kubectl get namespace istio-system 2>$null
if (-not $istioNamespace) {
    Write-Warn "Istio not found. Please install Istio first:"
    Write-Host "  Download from: https://istio.io/latest/docs/setup/getting-started/"
    Write-Host "  Or use: istioctl install --set profile=production -y"
    Write-Host ""
    $continue = Read-Host "Press Enter when Istio is installed, or Ctrl+C to abort"
} else {
    Write-Info "Istio is already installed"
}

# Enable Istio injection
Write-Info "Enabling Istio sidecar injection for $NAMESPACE namespace..."
kubectl label namespace $NAMESPACE istio-injection=enabled --overwrite

# Step 3: Deploy secrets
Write-Info "Step 3: Deploying secrets and configmaps..."
kubectl apply -f secrets.yaml
kubectl apply -f configmap.yaml

# Step 4: Deploy Vault
Write-Info "Step 4: Deploying HashiCorp Vault..."
kubectl apply -f vault-deployment.yaml
Start-Sleep -Seconds 10
Wait-ForStatefulSet -Namespace $VAULT_NAMESPACE -StatefulSet "vault"
Write-Info "Vault deployed. Remember to initialize and unseal Vault manually!"
Write-Warn "Run: kubectl exec -n vault vault-0 -- vault operator init"

# Step 5: Deploy Kafka
Write-Info "Step 5: Deploying Kafka cluster with Zookeeper..."
kubectl apply -f kafka-cluster.yaml
Start-Sleep -Seconds 15
Write-Info "Waiting for Zookeeper..."
Wait-ForStatefulSet -Namespace $KAFKA_NAMESPACE -StatefulSet "zookeeper"
Start-Sleep -Seconds 10
Write-Info "Waiting for Kafka..."
Wait-ForStatefulSet -Namespace $KAFKA_NAMESPACE -StatefulSet "kafka"
Write-Info "Creating Kafka topics..."
kubectl apply -f kafka-cluster.yaml | Select-String "Job" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

# Step 6: Deploy RabbitMQ
Write-Info "Step 6: Deploying RabbitMQ cluster..."
kubectl apply -f rabbitmq-cluster.yaml
Start-Sleep -Seconds 10
Wait-ForStatefulSet -Namespace $NAMESPACE -StatefulSet "rabbitmq"
Write-Info "RabbitMQ cluster deployed with durable queues and DLQs"

# Step 7: Deploy Elasticsearch
Write-Info "Step 7: Deploying Elasticsearch cluster..."
kubectl apply -f elasticsearch-cluster.yaml
Start-Sleep -Seconds 15
Wait-ForStatefulSet -Namespace $NAMESPACE -StatefulSet "elasticsearch"
Write-Info "Initializing Elasticsearch indices..."
try {
    kubectl wait --for=condition=complete job/elasticsearch-init -n $NAMESPACE --timeout=300s
} catch {
    Write-Warn "ES init job may have failed"
}

# Step 8: Deploy databases
Write-Info "Step 8: Deploying databases..."
kubectl apply -f postgres-deployment.yaml
kubectl apply -f redis-deployment.yaml
Start-Sleep -Seconds 10
Wait-ForStatefulSet -Namespace $NAMESPACE -StatefulSet "postgres"
Wait-ForDeployment -Namespace $NAMESPACE -Deployment "redis"

# Step 9: Deploy microservices
Write-Info "Step 9: Deploying microservices..."
$services = @("auth", "user", "orchestrator", "ai-interviewer", "code-execution", "video", "feedback", "notification", "analytics", "admin", "file", "payment", "search")
foreach ($service in $services) {
    Write-Info "Deploying ${service}-service..."
    kubectl apply -f "${service}-service-deployment.yaml"
}

# Wait for services
Start-Sleep -Seconds 15
$deployServices = @("auth", "user", "orchestrator", "ai-interviewer", "video", "feedback", "notification", "analytics", "admin", "file", "payment", "search")
foreach ($service in $deployServices) {
    try {
        Wait-ForDeployment -Namespace $NAMESPACE -Deployment "${service}-service"
    } catch {
        Write-Warn "${service}-service may have issues"
    }
}

# Step 10: Deploy HPA
Write-Info "Step 10: Deploying Horizontal Pod Autoscalers..."
kubectl apply -f hpa-all-services.yaml

# Step 10b: Deploy API Gateway
Write-Info "Step 10b: Deploying API Gateway..."
kubectl apply -f api-gateway-deployment.yaml
try { Wait-ForDeployment -Namespace $NAMESPACE -Deployment "api-gateway" } catch { Write-Warn "api-gateway may have issues" }

# Step 11: Deploy Istio Gateway
Write-Info "Step 11: Deploying Istio Gateway and mTLS configuration..."
kubectl apply -f istio-gateway.yaml
Write-Info "Istio Gateway deployed with strict mTLS enabled"

# Step 12: Deploy monitoring
Write-Info "Step 12: Deploying Prometheus, Grafana, and AlertManager..."
kubectl apply -f monitoring/prometheus-deployment.yaml
kubectl apply -f monitoring/prometheus-config.yaml
kubectl apply -f monitoring/prometheus-rules.yaml
kubectl apply -f monitoring/alertmanager-config.yaml
kubectl apply -f monitoring/grafana-deployment.yaml
kubectl apply -f monitoring/grafana-config.yaml
kubectl apply -f monitoring/grafana-dashboards-config.yaml
kubectl apply -f monitoring/grafana-dashboard-slo.yaml

Start-Sleep -Seconds 10
try { Wait-ForDeployment -Namespace $NAMESPACE -Deployment "prometheus" } catch { Write-Warn "Prometheus may have issues" }
try { Wait-ForDeployment -Namespace $NAMESPACE -Deployment "grafana" } catch { Write-Warn "Grafana may have issues" }
try { Wait-ForDeployment -Namespace $NAMESPACE -Deployment "alertmanager" } catch { Write-Warn "AlertManager may have issues" }

# Step 13: Verify deployment
Write-Info "Step 13: Verifying deployment..."
Write-Host ""
Write-Info "=== Deployment Status ==="
Write-Host ""
Write-Info "Namespaces:"
kubectl get namespaces | Select-String -Pattern "(devmeet|kafka|vault)"
Write-Host ""
Write-Info "Pods in $NAMESPACE:"
kubectl get pods -n $NAMESPACE
Write-Host ""
Write-Info "Services in $NAMESPACE:"
kubectl get svc -n $NAMESPACE
Write-Host ""
Write-Info "HPAs:"
kubectl get hpa -n $NAMESPACE
Write-Host ""
Write-Info "Istio Gateway:"
kubectl get gateway -n $NAMESPACE
Write-Host ""
Write-Info "Kafka pods:"
kubectl get pods -n $KAFKA_NAMESPACE
Write-Host ""
Write-Info "Vault status:"
kubectl get pods -n $VAULT_NAMESPACE

# Step 14: Get access endpoints
Write-Host ""
Write-Info "=== Access Endpoints ==="
Write-Host ""
$INGRESS_HOST = kubectl -n istio-system get service istio-ingressgateway -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>$null
if (-not $INGRESS_HOST) {
    $INGRESS_HOST = kubectl -n istio-system get service istio-ingressgateway -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>$null
}
if (-not $INGRESS_HOST) {
    Write-Warn "Could not determine Istio Ingress IP/Hostname. Using localhost for port-forward."
    Write-Info "To access services via port-forward:"
    Write-Host "  kubectl port-forward -n devmeet svc/grafana 3000:3000"
    Write-Host "  kubectl port-forward -n devmeet svc/prometheus 9090:9090"
    Write-Host "  kubectl port-forward -n devmeet svc/kibana 5601:5601"
    Write-Host "  kubectl port-forward -n devmeet svc/rabbitmq-client 15672:15672"
} else {
    Write-Info "Istio Ingress: https://$INGRESS_HOST"
    Write-Info "API Gateway: https://$INGRESS_HOST/api/v1"
}

Write-Host ""
Write-Info "Grafana: kubectl port-forward -n devmeet svc/grafana 3000:3000"
Write-Info "  Username: admin / Password: (from grafana secret)"
Write-Host ""
Write-Info "Prometheus: kubectl port-forward -n devmeet svc/prometheus 9090:9090"
Write-Host ""
Write-Info "AlertManager: kubectl port-forward -n devmeet svc/alertmanager 9093:9093"
Write-Host ""
Write-Info "Kibana: kubectl port-forward -n devmeet svc/kibana 5601:5601"
Write-Host ""
Write-Info "RabbitMQ Management: kubectl port-forward -n devmeet svc/rabbitmq-client 15672:15672"
Write-Info "  Username/Password: admin/changeme-in-production"
Write-Host ""
Write-Info "Vault: kubectl port-forward -n vault svc/vault 8200:8200"
Write-Warn "  IMPORTANT: Initialize and unseal Vault:"
Write-Host "  `$env:VAULT_ADDR='https://localhost:8200'"
Write-Host "  `$env:VAULT_SKIP_VERIFY='true'"
Write-Host "  kubectl exec -n vault vault-0 -- vault operator init"
Write-Host ""

# Post-deployment checklist
Write-Info "=== Post-Deployment Checklist ==="
Write-Host ""
Write-Warn "1. Initialize and unseal Vault (see instructions above)"
Write-Warn "2. Configure Vault secrets for microservices"
Write-Warn "3. Update TLS certificates in istio-gateway (replace self-signed certs)"
Write-Warn "4. Configure AlertManager webhooks (Slack, PagerDuty, email)"
Write-Warn "5. Configure Elasticsearch passwords (change default)"
Write-Warn "6. Configure RabbitMQ passwords (change default)"
Write-Warn "7. Verify all HPA metrics are available (metrics-server required)"
Write-Warn "8. Set up external DNS for Istio Ingress"
Write-Warn "9. Configure backup jobs for databases"
Write-Warn "10. Set up log aggregation (if using external logging)"
Write-Host ""

Write-Info "✅ Deployment complete!"
Write-Host ""
Write-Info "To check SLO metrics:"
Write-Host "  kubectl port-forward -n devmeet svc/grafana 3000:3000"
Write-Host "  Open http://localhost:3000 and navigate to 'DevMeet SLO Dashboard'"
Write-Host ""
Write-Info "To view active alerts:"
Write-Host "  kubectl port-forward -n devmeet svc/prometheus 9090:9090"
Write-Host "  Open http://localhost:9090/alerts"
Write-Host ""
Write-Info "For troubleshooting:"
Write-Host "  kubectl logs -n devmeet <pod-name> -f"
Write-Host "  kubectl describe pod -n devmeet <pod-name>"
Write-Host "  kubectl get events -n devmeet --sort-by='.lastTimestamp'"
