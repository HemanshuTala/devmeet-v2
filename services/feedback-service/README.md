# Feedback Service

Feedback Service evaluates a completed interview transcript, saves a score
report, and provides report/PDF endpoints. It is a FastAPI application on port
`8007`. Evaluation uses Groq when configured and otherwise uses a local
rule-based heuristic. The report record is stored in PostgreSQL when available.

## How it is called

```text
Candidate completes interview
  -> Orchestrator transaction writes session.completed outbox event
  -> Orchestrator outbox worker fetches transcript
  -> POST feedback-service:8007/api/v1/feedback/generate
  -> Feedback Service evaluates, optionally creates PDF, saves report
  -> Feedback page loads saved report (or requests generation if missing)
```

The Feedback page can also request generation directly when no report is
available. Thus evaluation may be requested from both the Orchestrator and
the page. The database uses an upsert by `session_id`, but concurrent repeated
evaluation may still call the evaluator more than once.

## Endpoints

| Method and path | Purpose |
|---|---|
| `GET /health` | Reports service liveness and whether PostgreSQL connected. |
| `POST /api/v1/feedback/generate` | Evaluates transcript, optionally creates/uploads PDF, saves report, schedules notifications, and returns scorecard JSON. |
| `GET /api/v1/feedback/{session_id}` | Retrieves a saved report; 404 if missing. |
| `GET /api/v1/feedback/{session_id}/pdf` | Generates/streams a PDF from the saved report. |
| `GET /uploads/{file}` | Serves local PDF files through FastAPI static files. |

The feedback routes do not declare an authentication dependency in their
current implementation. Do not assume that knowing a session ID is an
authorization check.

## Evaluation and percentile details

`FeedbackGenerator.generate_feedback()` checks for meaningful candidate
participation, then calls Groq if `GROQ_API_KEY` is present. If Groq is absent
or raises an error, the service calculates scores with local rules based on
answer length, question coverage, and keyword presence. This fallback is not
an LLM evaluation.

Percentiles come from fixed score buckets in `percentiles.py`; they are not
calculated from live historical candidate records. The configured
`peer_group_size` value is a constant.

## PDF and storage

PDF rendering uses WeasyPrint and `report_template.py`. The upload sequence is:

1. AWS S3 if the configured bucket/client is accessible.
2. File Service if S3 upload fails or is unavailable.
3. Local `uploads/` directory if the File Service request fails.

Compose mounts `services/feedback-service/uploads` into `/app/uploads`, making
the local fallback survive container recreation on that host. A generated
`pdf_url` may be an S3 presigned URL, a File Service URL, or a relative local
`/uploads/...` URL depending on the successful path.

## Configuration and running

Important Compose variables include `GROQ_API_KEY`, `GROQ_MODEL`,
`POSTGRES_*`, `FILE_SERVICE_URL`, and AWS credentials/bucket settings. See
`docker-compose.yml` for values passed to this service.

Run tests from the repository root in PowerShell:

```powershell
$env:PYTHONPATH = "E:\AI INTERVIEW\services\feedback-service"
python -m pytest services\feedback-service\app\test_feedback.py -v
```

The test fixture mocks PostgreSQL and external Groq/PDF/AWS dependencies, so
passing tests do not prove those integrations work in the current environment.
