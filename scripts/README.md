# Utility & Automation Scripts (`scripts/`)

## 1. Overview

The `scripts/` directory houses deployment automation, testing runners, health verification utilities, and container orchestration scripts.

---

## 2. Script Catalog

| Script | Platform | Purpose |
|---|---|---|
| `run_all_tests.py` | Python (Cross-platform) | **Authoritative unified test runner**. Executes all 220 unit tests across all 11 Python microservices with isolated PYTHONPATH environments. |
| `health-check.ps1` | PowerShell (Windows) | Pings `/health` endpoints across all 14 microservices and infrastructure containers, printing a color-coded status grid. |
| `start-docker.ps1` | PowerShell (Windows) | Spins up the full Docker Compose stack (`docker-compose.yml` + `docker-compose.services.yml`). |
| `start-local.ps1` | PowerShell (Windows) | Launches local Python and Node background processes without container virtualization. |
| `deploy-ec2.sh` | Bash (Linux) | Deploys container images to AWS EC2 instance using SSH and Docker Compose. |
| `setup-ecr.sh` | Bash (Linux) | Configures AWS Elastic Container Registry (ECR) repositories for all microservices. |
| `verify_system.py` | Python (Cross-platform) | Comprehensive end-to-end sanity verification script checking database connections, Redis ping, and gateway routes. |

---

## 3. Usage Examples

```bash
# Run all 220 unit tests
python scripts/run_all_tests.py

# Verify system health
python scripts/verify_system.py
```
