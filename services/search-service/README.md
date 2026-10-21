# Search Service

Search Service provides question search and random question selection for
DevMeet. It loads the question catalog from `app/questions_seed.py` into memory
when the service starts and serves requests from that in-process catalog.

The current seed catalog contains 156 question records. Search is implemented
with case-insensitive substring matching and simple title-first ranking. There
is no external search backend or database requirement.

## Request flow

```text
Question Bank frontend
  -> API Gateway :8000 (/api/v1/search)
  -> Search Service :8013
  -> FastAPI route
  -> in-memory SearchEngine
  -> JSON response
```

When the Orchestrator creates an interview session, it calls the random-question
endpoint directly using `SEARCH_SERVICE_URL` (default in Compose:
`http://search-service:8013`). The selected question can be used to prefill the
session focus area.

## Endpoints

All search endpoints use the `/api/v1/search` prefix.

| Method and path | Purpose |
|---|---|
| `GET /questions` | Search/filter questions. Supports `q`, `interview_type`, `difficulty`, `company`, `limit` (1–100), and `offset` (0 or greater). |
| `GET /questions/random` | Select a random question. Supports optional `interview_type`, `difficulty`, and `company` filters. Returns 404 if nothing matches. |
| `GET /questions/{question_id}` | Get a question by its ID. Returns 404 if it is not in the catalog. |
| `POST /questions` | Add a question to the current process's in-memory catalog. |
| `GET /health` | Return service status and loaded question count. |

Search text is matched as a substring in a question's title, description, tags,
and company tags. Title matches rank above description and topic-tag matches.
Category and company filters are case-insensitive.

## Data and persistence

`app/questions_seed.py` is the source of the initial catalog. A question added
through `POST /questions` is available only until the Search Service process
restarts; it is not written to a persistent store. The POST route currently
does not have an authentication dependency, so it should not be treated as an
admin-only endpoint.

## Run tests

From the repository root in PowerShell:

```powershell
$env:PYTHONPATH = "E:\AI INTERVIEW\services\search-service"
python -m pytest services\search-service\app\test_search.py -v
```

To rebuild and start the Search Service container after dependency changes:

```powershell
docker compose up --build search-service
```
