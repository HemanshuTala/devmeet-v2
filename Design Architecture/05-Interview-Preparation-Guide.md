# DevMeet: Easy-English Interview Guide

This guide explains what the DevMeet source code actually implements. It is written to help you describe the project clearly in an interview, including the important limits and unfinished connections.

The repository contains plans and configuration as well as application code. A name in a configuration file does not prove that a feature works end to end. This guide treats a feature as implemented only where there is a code path that performs the work. Provider integrations that need credentials or external services are described as conditional, not as services that are necessarily running.

Use the example answers as a starting point. Change them to match your own contribution; do not say you personally built something if you did not.

## 1. DevMeet in simple words

DevMeet is a web application for practising interviews. A user can create an interview session, get questions from an AI service, answer them, save the conversation, run code, and view feedback.

The application is divided into a browser frontend and backend services. The frontend shows the pages and sends API requests. Backend services handle accounts, interview sessions, AI questions, code execution, search, payments, and feedback. PostgreSQL stores durable records. Redis is used for selected short-lived tasks such as caching, locks, and limits.

The repository has code for more features than can be confidently described as fully connected and production-ready. The important example is feedback generation after session completion: there is an automatic event path, but its request is missing required feedback data. The feedback page has a separate request path that sends the transcript.

## 2. A short project introduction

### About 30 seconds

> DevMeet is a web application for interview practice. A user can create a session, receive streamed questions from an AI interviewer, save answers, run code in supported languages, and request a feedback report. The frontend uses Next.js and TypeScript. The backend is split into services, with PostgreSQL for saved records, Redis for selected temporary coordination, and RabbitMQ for queued code-execution jobs. The code has useful working paths, but I would be clear about the unfinished parts: automatic feedback after session completion does not currently send the transcript required by the feedback API, and the video code does not connect the browser to a LiveKit room.

### About 90 seconds

> The user works in the Next.js website. The backend services have separate responsibilities: authentication handles login, the orchestrator manages interview sessions, the AI service generates questions, the code-execution service runs submitted programs, and the feedback service evaluates a saved transcript. PostgreSQL stores the main application records. Redis is used for a few short-lived needs, and the code-execution service has a RabbitMQ queue for asynchronous jobs.
>
> For an interview question, the browser sends the session settings and conversation history to the AI service. The service calls a Groq-hosted language model when it has a usable client, validates the response shape, and streams response data to the browser. For code, the service performs a source scan and runs the program through Docker. The async route queues a job and the worker stores its result in Redis.
>
> This service separation keeps different responsibilities apart, but it also makes local setup and cross-service debugging harder. I would not claim every advertised flow is complete: the automatic completion-to-feedback event omits the transcript, and getting a LiveKit token is not the same as joining a video room. I would improve those contracts and test the full browser journey before calling them complete.

### How to make this your own

- Say which part you personally worked on.
- Give a concrete example of a decision and one downside.
- Say "the code does..." for repository behaviour, and "I would..." for a proposed improvement.
- Do not invent user counts, speed targets, uptime, production usage, or personal ownership.

## 3. The main technologies in everyday language

| Technology | What it does in this repository | Why it can fit this job |
| --- | --- | --- |
| Next.js and React | Build the browser-facing pages and interactive UI. | They support reusable components and page-level application structure. |
| TypeScript | Adds type information to frontend JavaScript. | Types can catch some mistakes while developing, though they do not prove that an API works correctly. |
| FastAPI and Python | Provide HTTP APIs for several backend services. | FastAPI provides request routing and data validation through Python models. |
| Node.js | Runs the video service that creates LiveKit access tokens. | It is a lightweight runtime for this small API service. |
| PostgreSQL | Stores application records such as sessions, turns, analytics, and feedback. | Relational tables and constraints suit data with clear relationships. |
| Redis | Supports selected short-lived state and coordination in services. | Fast reads are useful for temporary keys, counters, locks, and cached values. |
| RabbitMQ | Carries asynchronous code-execution jobs to a worker. | A queue lets the submit request return before the code has finished running. |
| Elasticsearch | Provides question search when it is available. | It supports text search over question fields; the service also has a local in-memory fallback. |
| Docker | Runs submitted code in containers through the execution service. | Containers provide a boundary for runtime dependencies and resource restrictions, but are not automatically a secure sandbox. |
| Groq API | Supplies the language model used by the AI interviewer and attempted by feedback generation. | The project can call a hosted model rather than hosting model weights itself. |
| Razorpay | The payment service contains order and payment-verification code for this provider. | A payment provider can handle payment processing, but real use depends on correct credentials and webhook verification. |

These are explanations of how the technologies fit the code. Unless you personally made the choice, do not claim that you selected a technology or that a particular performance benefit was measured.

## 4. How the application is organised

At a high level, the code follows this shape:

```text
Browser
  |
  +-- Next.js / React frontend
        |
        +-- HTTP requests to backend APIs
              |
              +-- Authentication service
              +-- User service
              +-- Orchestrator service
              +-- AI interviewer service
              +-- Code-execution service
              +-- Search service
              +-- Feedback service
              +-- Other service APIs

PostgreSQL: durable application records
Redis: selected temporary state, locks, and limits
RabbitMQ: queued code-execution jobs
Elasticsearch: question search when available
Docker: execution environment used by the code runner
```

This picture describes code and service responsibilities; it does not say that every external service is currently running in a production environment. In particular, a Compose service declaration is not proof that an external provider is configured or that a user journey is complete.

### Why use separate services?

Separate services can make responsibilities easier to understand. The code runner has different risks from the user-profile API, and AI requests have different timing and provider dependencies from session updates.

The cost is more operational work: services must be started, configured, monitored, and connected correctly. A request can fail because a downstream service is unavailable or because two services disagree about a request shape. The feedback event mismatch is a real example of the latter.

## 5. Main user journey, step by step

### A. Sign in

The authentication service has code for registration, password login, email verification, password reset, MFA, token refresh, and logout-related routes. Passwords are hashed with bcrypt. The service creates signed access and refresh tokens.

The frontend API client stores an access token in browser local storage. The backend also sets an HttpOnly refresh-token cookie. Login/refresh responses also contain a refresh token that the frontend stores, so do not describe the current implementation as "cookie-only".

The auth service has role-checking code, but do not describe OAuth login as implemented based only on a module title or comment. The auth routes found here are the password, verification, MFA, and token routes listed above; no OAuth callback flow was found in those routes.

**Why use short-lived access tokens?** An access token is sent with API requests to identify the user. A refresh token can be used to obtain another access token. This separates ordinary API use from longer-lived sign-in state. The implementation still needs careful handling because browser local storage can be read by injected JavaScript.

### B. Create an interview session

The frontend sends the selected interview type, difficulty, duration, and optional company or focus settings to the orchestrator. The orchestrator checks the caller's identity, asks the user service about usage allowance, checks for an existing active session, and writes the new session in PostgreSQL. Redis is used for selected locking, caching, and active-session information.

The create flow can ask the search service for a seed question. The session itself is stored in PostgreSQL. The session model includes fields such as status, timing, and counts for tab switches and paste events.

The user service has plan and quota endpoints. One important detail is that the orchestrator's create-session path calls the quota increment operation; this is not just a read-only "check quota" in that path. The separate plan-update route also has code that resets counters on upgrades.

### C. Start, pause, resume, and complete

The orchestrator has routes for session lifecycle operations, including starting, pausing, resuming, completing, and cancelling sessions. It validates allowed status transitions, checks that a session belongs to the current user, and persists session status and elapsed time in PostgreSQL.

The code also has routes for retrieving and saving conversation turns. The frontend feedback page loads those turns to create the transcript it sends to feedback.

The completion route updates the session status first. It then separately tries to insert an outbox event. These are not one atomic database transaction. If event insertion fails, the route logs a warning and continues because the session is already marked complete.

### D. Get an AI question

The interview page sends the session ID, type, difficulty, optional focus/company, and conversation history to the AI service. The AI service checks the request and applies rate/token limits, prunes old conversation history, and checks user messages for a limited set of prompt-injection patterns. It then calls Groq if a client is available and returns a response as Server-Sent Events (SSE).

The service attempts to parse and validate the model's response. It has model/key retry logic and can return a generic fallback question when it cannot get a usable model response. A fallback keeps the endpoint from always failing, but it is not a personalised answer from the model.

The AI service also has logic to score answer quality and adjust difficulty. This is heuristic application logic, not proof that the model correctly understands the candidate's skill. The pattern checks are limited and do not guarantee that prompt injection or unsafe output is prevented.

#### What does streaming mean?

Instead of waiting for the full answer, the server sends pieces as they become available. The frontend reads those pieces and updates the displayed message. Streaming can make the wait feel shorter, but it does not guarantee the model itself completes sooner.

#### How voice input/output is represented

The frontend includes browser speech-related code for speaking or recognising interview answers. Browser support varies, so typing remains important. This describes browser features in the frontend; it does not mean the application has a separate, universally available speech-recognition backend.

### E. Run code

The code-execution service has synchronous execution, test-case execution, safety-scan, supported-language, and asynchronous-submit routes. The code editor is provided by Monaco in the frontend.

For a synchronous run, the route scans the source and asks the executor to run it. For an asynchronous run:

1. The route creates a job ID and writes a pending status to Redis.
2. It publishes the job to the `code_execution_tasks` RabbitMQ queue.
3. A worker started by the service consumes the job.
4. The worker asks the executor to run the program.
5. The worker writes the result to Redis for the status route to return.

The code advertises Python, JavaScript, Java, C++, Go, and Rust. Resource restrictions differ between execution paths, so do not claim that every language path has identical isolation settings.

#### Important limitation of the async worker

The worker acknowledges a RabbitMQ message in a `finally` block, including after an exception. If execution fails before the worker writes a result, the job can remain marked pending in Redis while the queue message has already been acknowledged. The message therefore will not automatically be retried by RabbitMQ in that case.

#### A scan is not a security boundary

The service has source-pattern checks before execution. Pattern scans can miss harmful code and can also reject code for simple textual reasons. The executor uses Docker and applies restrictions, but those restrictions are not identical in every execution path.

The Compose configuration mounts the host Docker socket into the code-execution service. Docker daemon access is powerful; this is a major risk if an attacker can control that service. A production design should isolate execution workers and avoid granting public-facing application code unrestricted host-Docker access.

### F. View feedback

The feedback page loads the session and its saved turns. It first requests an existing report. If one is not available, it can send session ID, interview type, difficulty, and transcript to the feedback service to request generation.

The feedback service checks that there is enough participation, tries Groq-based evaluation, and has a local heuristic fallback. It persists report data in PostgreSQL. The code can generate a PDF when its PDF dependency is available, and has storage paths that depend on its configuration.

If the feedback API path fails, the frontend also contains its own local scoring fallback. As a result, a score shown on screen may come from the feedback service or from frontend fallback logic. It should not be presented as a validated or calibrated hiring score.

#### What the scores mean

The feedback API exposes an overall score and named score fields such as communication, problem solving, code quality, time complexity, and behavioural score. Which fields are populated depends on the interview type and generation path. The local fallback uses simple signals such as answer length, question coverage, and the presence of words such as "complexity"; it is a heuristic, not a deep measurement of ability.

The generator's percentile estimate is based on hard-coded score ranges and simulated comparison data, not on a verified population of real interview candidates. Do not describe it as a real-world percentile.

#### The automatic feedback connection is incomplete

The orchestrator's completion event contains session ID, user ID, interview type, and difficulty. The outbox publisher sends only session ID and user ID to the feedback endpoint. The feedback request model requires session ID, interview type, difficulty, and transcript.

There is another reliability gap: the session update and event insert are separate database operations. Therefore, the outbox mechanism does not guarantee that every completed session has a corresponding event. The feedback page's separate request includes the transcript, but that is distinct from the automatic completion event.

An interview-ready description is: "The repository has an outbox publisher and a feedback generation API, but the automatic completion-to-feedback path is not complete because the event consumer does not supply all required fields. The results page has a separate generation request that sends the transcript."

## 6. Other code-backed service behaviour

### Search

The search service can query Elasticsearch when it is available. It also seeds and searches a local in-memory list of sample questions, and falls back to local search if Elasticsearch search fails. The local fallback is not a durable replacement for an indexed question store.

### Analytics

The analytics API accepts event and batch-event requests. The database code writes events directly to PostgreSQL and has an in-memory fallback if database use is unavailable or fails. Kafka is not used by the application analytics path found in the service code. Kafka configuration or a dependency alone is not evidence of a Kafka producer or consumer.

### Payments

The payment service has code to create Razorpay orders when configured and has a mock/development path. The payment-verification route checks an HMAC signature when Razorpay mode is enabled. The webhook route has an important weakness: it verifies a signature only when the signature header is present. In real-provider mode, a request with no signature header can skip that verification branch and continue to event processing. Do not claim webhook verification is complete until that path is fixed and tested.

The plan-update API and payment service both contain plan-related logic. Do not claim that paid subscriptions are securely and fully connected to every user quota path without checking the integration and deployment configuration.

### Files

The file service contains upload validation, including a 50 MB size limit, and code paths for local storage or S3 when configured. It also contains presigned-URL code. This means the repository supports those paths; it does not prove that AWS credentials or an S3 bucket are configured in the environment being interviewed about.

### Video

The video backend creates a LiveKit access token when configured and has a mock response path. The frontend requests the token, but the frontend source does not call LiveKit's room connection API. A camera preview or UI connection indicator is not a LiveKit call. The correct statement is that token-generation code exists; a real browser-to-LiveKit room connection was not found.

### Frontend monitoring of interview behaviour

The orchestrator has endpoints and stored fields for events such as tab switching, paste counts, heartbeat, and consent. The frontend also has browser-side proctoring-related code. These signals can describe browser behaviour, but they are not proof that someone cheated. Browser-side face, gaze, or object detection can be inaccurate and should not be presented as certain evidence.

## 7. Data and storage choices

### PostgreSQL

PostgreSQL stores durable records used by the services. Examples in the code include sessions, conversation turns, analytics events, and feedback records. The repository has a shared development schema with tables for several service areas. Do not say that every microservice has a separate database just because the application is divided into services.

### Redis

Redis is used for selected ephemeral data, such as locks, cached session information, token/rate counters, or code-job state. Redis data should not automatically be described as permanent. The exact use differs by service, and some services have fallback behaviour if Redis is unavailable.

### Elasticsearch

Elasticsearch is used for question searching if reachable. It is not the main store for user sessions or interview transcripts. The search service's local in-memory questions are a fallback and may be lost when the process restarts.

### RabbitMQ

RabbitMQ has a real application path for queued code-execution work. The route publishes a message and the worker consumes it. This is different from Kafka, for which no producer or consumer calls were found in the application path reviewed.

### Why split storage by purpose?

The simple reasoning is to use each system for the type of work it supports: relational records in PostgreSQL, temporary coordination in Redis, text search in Elasticsearch, and waiting jobs in RabbitMQ. Each additional system also adds deployment, monitoring, and failure-handling work. It is worth keeping only systems that have a working use case.

## 8. Security and reliability points worth knowing

These are code-grounded design limits, not claims that the application has suffered an incident.

1. **Code execution is sensitive.** The service accepts user code, uses Docker, and the Compose setup mounts the host Docker socket. Pattern scanning is not enough to make arbitrary code safe.
2. **The payment webhook check is incomplete.** A missing signature header can skip the current verification condition in real-provider mode.
3. **The outbox work is not atomic with session completion.** The session update and event insert are separate operations.
4. **The automatic feedback request is missing data.** The publisher does not send the transcript and other required fields.
5. **The async execution worker acknowledges failures.** A failed job may be left pending instead of being retried.
6. **Fallback answers and scores are not equivalent to full AI results.** The AI service, feedback service, and frontend each have fallback paths.
7. **Browser token storage has trade-offs.** The frontend stores tokens in local storage, and the backend also uses an HttpOnly refresh cookie.
8. **The AI safety checks are limited.** Pattern checks do not guarantee protection against prompt injection or inaccurate model output.
9. **Configured infrastructure is not proof of running infrastructure.** Provider credentials, service health, and actual deployment must be checked separately.

### How to explain a trade-off

Use this simple structure:

1. What problem does the design address?
2. What did the code choose?
3. What is the benefit?
4. What is the cost or risk?
5. What would you change if the system grew?

For example:

> The async code route uses RabbitMQ so the HTTP request can return a job ID without waiting for execution to finish. A worker handles the job and stores its result in Redis. This separates submission from execution, but it adds a queue and worker lifecycle to operate. I also found that the worker acknowledges a message even after an exception, so I would correct the retry and failure-state handling before relying on it.

## 9. Frontend design, in simple terms

The frontend uses pages for screens, reusable components for repeated UI, hooks for reusable behaviour, and a shared API client for backend requests. The interview UI includes a code editor, conversation display, speech-related behaviour, and session controls.

It is useful to separate:

- **Server-owned facts:** session status, saved turns, user profile, and report data. The frontend displays these but the backend is the durable owner.
- **Temporary screen state:** whether a panel is open, which tab is selected, or whether a menu is visible. This usually belongs in browser state.

This separation helps avoid showing a change as saved when only the browser copy was updated.

## 10. How to talk about testing and deployment

The repository contains a CI workflow and Compose configurations. A configuration file says what a command or service is set up to do; it does not prove that the application has passed all checks or is deployed and healthy.

The CI workflow has checks whose failures are explicitly ignored, including Python test commands piped through `head` and followed by `|| true`, and frontend lint with `|| true`. The frontend build is run as a workflow step. Node tests use `npm test --if-present`, which may skip when the script is absent. Therefore, do not claim that every configured test is a strict release gate.

For a strong interview answer, distinguish:

- **Unit tests:** check a small function or rule.
- **Integration tests:** check that services and dependencies work together.
- **End-to-end tests:** check a real user journey across browser and backend.
- **Build checks:** check that code compiles or bundles; they do not prove runtime behaviour.

A useful end-to-end test would create a session, start it, save turns, complete it, generate feedback with the full transcript, and display the result. The automatic completion event should also be tested separately because it currently has a request-contract gap.

Do not claim high availability, horizontal scaling, production monitoring, or an active cloud deployment merely from Compose, Prometheus scrape configuration, or a deployment document. Verify the live environment and actual metrics before making those claims.

## 11. Interview questions and sample answers

### 1. What problem does DevMeet solve?

> It gives people a way to practise interviews, save their answers, run code for coding practice, and receive feedback. The code includes session management, AI question generation, code execution, and feedback generation.

### 2. Walk me through the main user journey.

> The user signs in, creates an interview session, and the orchestrator saves it. The frontend sends the conversation history to the AI service for questions and saves turns through the session API. For a coding question, the code-execution service can run code synchronously or queue it through RabbitMQ. At the end, the feedback page can send the saved transcript to the feedback service.

### 3. Why separate the backend into services?

> The code separates areas with different responsibilities, such as accounts, sessions, AI, and code execution. That can make each part easier to change independently. The trade-off is that requests cross service boundaries, so contracts and failure handling matter. The incomplete automatic feedback request is an example of a contract that needs work.

### 4. Why use PostgreSQL?

> The application stores related records such as users, sessions, turns, and feedback. PostgreSQL provides structured tables and relationships for those records. The repository uses one shared development database schema for multiple service areas, so I would not describe it as a separate database for every service.

### 5. Why use Redis?

> Redis is used for selected short-lived needs such as locks, cached session information, counters, and asynchronous job state. It can make those operations quick, but the system should be clear about what can be rebuilt and what must be durable in PostgreSQL.

### 6. Is Kafka used?

> I did not find Kafka producer or consumer calls in the application code. Analytics writes directly to PostgreSQL. Kafka appears in configuration and dependencies, but that alone does not make it part of the working application flow.

### 7. Is RabbitMQ used?

> Yes. The asynchronous code-execution endpoint publishes jobs to a RabbitMQ queue, and a worker consumes them. The result is stored in Redis for the status endpoint. One issue is that the worker acknowledges the message even after an exception, so retry handling should be fixed.

### 8. How does AI question generation work?

> The frontend sends interview settings and prior conversation to the AI service. The service prepares a prompt, limits the history, calls Groq when configured, checks the response structure, and streams the result using SSE. If the provider is unavailable or the response cannot be used, there is fallback question logic.

### 9. Why stream AI responses?

> Streaming lets the browser show text as it arrives instead of waiting for the complete answer. It improves the feeling of responsiveness, although it does not necessarily reduce the model's total generation time.

### 10. Does the AI adapt to the candidate?

> There is code that scores answers using heuristics and adjusts difficulty based on accumulated scores. I would describe it as a basic adaptive mechanism, not as a proven skill assessment. I would validate the rubric with tests and real evaluations before making stronger claims.

### 11. How is submitted code run?

> The service performs source checks and asks a Docker-based executor to run code for the selected language. The async route can put the job on RabbitMQ and let a worker process it. The restrictions differ by execution path, and Docker containers should not be treated as a perfect security boundary.

### 12. Is the code runner secure for arbitrary public code?

> I would not claim that yet. It has source scanning and Docker execution restrictions, but source scanning can be bypassed. The Compose setup also gives the service access to the host Docker socket, which is powerful. I would isolate execution workers more strongly and test resource and network limits before public use.

### 13. Does session completion automatically create a feedback report?

> There is an outbox publisher intended to request feedback, but the current automatic path is incomplete. The publisher sends only session ID and user ID, while the feedback API requires interview type, difficulty, and transcript too. The feedback page has a separate path that sends the transcript and can request generation.

### 14. Is the outbox fully reliable?

> Not yet. The session update and outbox insert are separate database operations, so they are not atomic. Also, if the insert fails, the route logs a warning and the session remains completed without an event. I would put both writes in one transaction and test retries and duplicate delivery.

### 15. Are the feedback scores objective?

> No. The feedback path can call an AI model, but it also has heuristic fallbacks. Some fallback scores depend on answer length, coverage, or keywords. The percentile estimate uses hard-coded ranges and simulated comparison data. I would present the report as practice guidance, not as a validated hiring decision.

### 16. Does the project use LiveKit for live video?

> The video service has code to create a LiveKit token and the frontend requests it. I did not find a frontend call that connects a LiveKit room. So I would say token generation exists, but I would not claim a working LiveKit video call.

### 17. What happens when Elasticsearch is down?

> The search service can search its in-memory seed questions and has fallback logic if Elasticsearch search fails. That fallback supports basic search, but it is not a durable copy of the full search index.

### 18. How does authentication work?

> Passwords are hashed with bcrypt. The service issues signed access and refresh tokens and has routes for email verification, password reset, and MFA. The frontend stores an access token in local storage, while the backend also sets an HttpOnly refresh cookie. I would be precise about this mixed storage behaviour.

### 19. What would you improve first?

> I would fix the completion-to-feedback contract and make session completion plus outbox insertion transactional. I would also fix the async worker's failure handling and reduce the code runner's exposure to Docker daemon access. Then I would add an end-to-end test that verifies the full interview-to-report journey.

### 20. What is one trade-off in the project?

> Splitting work into services keeps responsibilities separate, and RabbitMQ lets code execution happen asynchronously. The cost is more infrastructure and more opportunities for services to disagree about contracts. The feedback request mismatch shows why cross-service tests are important.

### 21. How would you scale this application?

> I would measure it first rather than assume what is slow. Then I would scale the part with measured pressure, check whether it stores shared state in process memory, and verify PostgreSQL and queue capacity. Running more copies is not automatically safe if state or job handling is not shared correctly.

### 22. How do you know whether a feature works?

> I trace it from the UI or API entry point to the code that performs the work and the place that saves or returns the result. I also check error and fallback paths. A dependency, route name, Compose service, or architecture diagram alone is not enough to prove an end-to-end feature.

## 12. Facts to remember before the interview

- The code has separate backend services, but the development schema puts many service tables in a shared PostgreSQL database.
- The orchestrator uses the user service's quota increment path while creating a session.
- RabbitMQ is used for asynchronous code-execution jobs; Kafka application producers/consumers were not found.
- Analytics event storage is directly in PostgreSQL, with an in-memory fallback.
- The feedback page can send a transcript, but the automatic outbox publisher does not.
- The session completion update and outbox insert are separate operations.
- The feedback percentile is simulated, not measured against a verified candidate population.
- The code runner has Docker-related restrictions, but the host Docker socket mount is a serious risk.
- The async worker acknowledges messages even after exceptions.
- LiveKit token creation exists, but a browser room connection was not found.
- Provider-backed paths such as Razorpay and S3 depend on configuration and credentials.
- A CI command configured to ignore failures is not a strict passing test gate.

## 13. Source files to review before your interview

Read the files related to the feature you personally worked on. These links point to implementation code rather than only architecture descriptions.

- [Auth routes](../services/auth-service/app/routes.py) and [auth implementation](../services/auth-service/app/auth.py)
- [Frontend API client](../frontend/src/lib/api.ts)
- [Orchestrator routes](../services/orchestrator-service/app/routes.py) and [orchestrator database access](../services/orchestrator-service/app/database.py)
- [Outbox publisher](../services/orchestrator-service/app/outbox.py)
- [Feedback request models](../services/feedback-service/app/models.py), [feedback routes](../services/feedback-service/app/routes.py), and [feedback generator](../services/feedback-service/app/generator.py)
- [AI routes](../services/ai-interviewer-service/app/routes.py) and [AI manager](../services/ai-interviewer-service/app/ai_manager.py)
- [Code-execution routes](../services/code-execution-service/app/routes.py), [queue manager](../services/code-execution-service/app/queue_manager.py), and [executor](../services/code-execution-service/app/executor.py)
- [Search engine](../services/search-service/app/search_engine.py)
- [Analytics database access](../services/analytics-service/app/database.py)
- [Payment routes](../services/payment-service/app/routes.py)
- [Video service](../services/video-service/src/index.js) and [frontend WebRTC hook](../frontend/src/app/interview/hooks/useWebRTC.ts)
- [CI workflow](../.github/workflows/ci-cd.yml)
- [Development service Compose file](../docker-compose.services.yml)

## Final advice

An honest answer is stronger than an exaggerated one. Explain the working path, name the limitation, and describe a practical fix. That shows you understand both the design and the real behaviour of the code.
