# DevMeet v2.0 — Design Architecture

This folder contains all system design diagrams for the DevMeet AI Interview Platform, in IEEE format.

## How to Open the Diagrams

**Option A — Browser (free, no install):**
1. Go to [https://app.diagrams.net](https://app.diagrams.net)
2. Click **File → Open from → Device**
3. Select any `.drawio` file from this folder

**Option B — VS Code:**
1. Install the [draw.io extension](https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio)
2. Click any `.drawio` file in the VS Code explorer — it opens as a visual diagram

**Option C — Desktop app:**
1. Download [diagrams.net desktop](https://github.com/jgraph/drawio-desktop/releases)
2. Open the `.drawio` file directly

---

## Diagram Index

| # | Diagram File | Description File | What it shows |
|---|-------------|-----------------|--------------|
| 1 | [HLD-System-Architecture.drawio](./HLD-System-Architecture.drawio) | [📄 Read](./HLD-System-Architecture.md) | Full system: all 14 services, 6 data stores, all layers from users to infrastructure |
| 2 | [LLD-Auth-Flow.drawio](./LLD-Auth-Flow.drawio) | [📄 Read](./LLD-Auth-Flow.md) | All auth flows: Register, Login, MFA, OAuth2 (Google/GitHub), Token Refresh, Logout |
| 3 | [LLD-Interview-Orchestration.drawio](./LLD-Interview-Orchestration.drawio) | [📄 Read](./LLD-Interview-Orchestration.md) | Session state machine + full E2E interview pipeline (create → AI stream → code exec → feedback) |
| 4 | [LLD-DB-Schema.drawio](./LLD-DB-Schema.drawio) | [📄 Read](./LLD-DB-Schema.md) | Complete database ER diagram: all tables, columns, constraints, FK relationships |
| 5 | [LLD-Complete.drawio](./LLD-Complete.drawio) | [📄 Read](./LLD-Complete.md) | All 14 services with their APIs and every connection between them |
| 6 | — | [📄 Read](./DB-Architecture-Decisions.md) | Database architecture decisions: sharding, partitioning, scaling ladder, Redis/Kafka/S3 rationale |

---

## Reading Order

If you are new to this codebase, read in this order:

1. **HLD** — understand the big picture first
2. **LLD-Auth-Flow** — understand how users log in and how JWTs work
3. **LLD-Interview-Orchestration** — understand how an interview session works end-to-end
4. **LLD-DB-Schema** — understand what data is stored and how tables relate
5. **LLD-Complete** — use as a reference when you need to know which service calls which

---

## IEEE Document Numbers

| Document | Number |
|----------|--------|
| High-Level Design | DevMeet-HLD-001 |
| LLD — Auth & User | DevMeet-LLD-001 |
| LLD — Interview Core | DevMeet-LLD-002 |
| LLD — Complete Services | DevMeet-LLD-003 |
| Database Schema | DevMeet-DB-001 |

---

## Related Documentation

| Document | Location |
|----------|----------|
| Full system design docs (text) | `docs/SYSTEM_DESIGN/` |
| Database DDL (SQL) | `migrations/init_dev_schema.sql` |
| API contracts | `docs/API.md` |
| SRS | `DevMeet_SRS_v2.md` |
