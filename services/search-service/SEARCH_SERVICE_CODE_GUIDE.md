# Search Service: Easy-English Code Guide

This guide explains what the Search Service files do, what their main code blocks and functions mean, and how a request moves through the service. It describes the current code, including places where older comments or package documentation promise more than the implementation provides.

## What the service does

The Search Service provides interview questions to the DevMeet application. It loads a list of questions into memory when it starts. It can search and filter that list, choose a random matching question, look up a question by ID, and add a question to the running process.

The service listens on port `8013` in its Docker container. It does not use a database or a separate search engine. Questions added through the API are lost when the service process restarts.

## How a request moves through the service

1. A client, such as the frontend or another service, sends an HTTP request.
2. `RequestIDMiddleware` gives the request an ID and logs how long it takes.
3. FastAPI checks the URL, query parameters, and request body.
4. A function in `routes.py` calls the shared `search_engine` object.
5. `SearchEngine` reads the in-memory question list and returns results.
6. FastAPI turns the result into JSON and sends it back with the request ID.

## Files in this service

### `app/main.py` — create and start the web application

- The opening text describes the module, but some of its claims (such as autocomplete and full-text search) are not implemented by the code.
- `import os` allows the service to read the frontend URL from an environment variable.
- The FastAPI imports and local imports provide the web framework, CORS handling, API router, and request-ID middleware.
- `app = FastAPI(...)` creates the application and sets its displayed name and version.
- `app.add_middleware(CORSMiddleware, ...)` allows browser requests from the one configured frontend origin. `FRONTEND_URL` can set that origin; if it is not set, the value is `http://localhost:3000`. Credentials, HTTP methods, and headers are allowed by this CORS configuration.
- `app.add_middleware(RequestIDMiddleware)` makes the request-ID middleware process requests and responses.
- `app.include_router(router)` adds the question API endpoints defined in `routes.py`.
- `health_check()` handles `GET /health`. It returns a healthy status, the service name, and the number of questions currently in memory.
- `read_root()` handles `GET /`. It returns a short message identifying the service.

### `app/middleware.py` — attach a request ID and log request time

- The imports provide UUID creation, logging, wall-clock timing, and the FastAPI/Starlette request and response types.

- `logger` creates a named logger for request records.

- `RequestIDMiddleware` is the middleware class used by `main.py`.

- `dispatch(request, call_next)` runs for each HTTP request:

  1. It takes the incoming `X-Request-ID` header, or makes a new UUID if the header is missing or empty.
  2. It saves the ID on `request.state.request_id` so other code can access it.
  3. It records the start time using `time.time()`.
  4. It calls the next middleware or endpoint and waits for its response.
  5. It adds the same ID to the response's `X-Request-ID` header.
  6. It calculates the elapsed time in milliseconds and logs the ID, HTTP method, URL path, response status, and elapsed time.
  7. It returns the response.

  The module description says the timer is monotonic, but the code uses `time.time()`, which is a wall-clock timer.

### `app/models.py` — describe and validate question data

This file defines Pydantic models. FastAPI uses these models to check and format request and response data.

- `Question` describes one question record:
  - `id`, `title`, `description`, `interview_type`, and `difficulty` are required strings.
  - `tags`, `company_tags`, and `hints` are lists of strings. They default to empty lists if omitted.
- `SearchRequest` describes possible search criteria: a text query, interview type, difficulty, company, page size, and offset. Its page size defaults to 10 and must be from 1 through 100. Its offset defaults to 0 and cannot be negative. The current routes define these query parameters directly rather than using this model.
- `SearchResponse` describes a search result: the page of `Question` records, the total number of matches before paging, and the optional query text echoed to the client.

### `app/routes.py` — expose the HTTP API

- The imports provide FastAPI route and validation tools, optional types, UUID creation, the data models, and the shared search engine.
- `router = APIRouter(...)` groups these endpoints under `/api/v1/search`. Therefore the paths below include that prefix.
- `search_questions(...)` handles `GET /api/v1/search/questions`. It accepts optional `q`, `interview_type`, `difficulty`, and `company` filters. `limit` defaults to 10 and must be between 1 and 100; `offset` defaults to 0 and must be non-negative. It passes these values to `SearchEngine.search()` and returns the resulting questions, total, and query.
- `get_random_question(...)` handles `GET /api/v1/search/questions/random`. It passes any interview type, difficulty, and company filters to the engine. If no question matches, it returns HTTP 404 with the message `No matching question found`.
- `get_question(question_id)` handles `GET /api/v1/search/questions/{question_id}`. It looks for an exact ID match. If there is no question with that ID, it returns HTTP 404 with the message `Question not found`.
- `create_question(question)` handles `POST /api/v1/search/questions`. FastAPI first validates the request body as a `Question`. If its ID is an empty string, this function generates a UUID. Then it adds the question to the in-memory catalog and returns it. If the engine reports failure, it returns HTTP 500. The current engine always reports success. This route does not currently require authentication, check for duplicate IDs, or save the question to permanent storage.

The route description calls text matching “fuzzy,” but the implementation checks for literal case-insensitive substrings; it does not correct spelling or find similar words.

### `app/search_engine.py` — search and manage the in-memory list

- The imports provide random selection, type hints, and the initial seed data.
- `SearchEngine` is the class that performs the actual filtering and lookup.
- `SearchEngine.__init__()` copies `SEED_QUESTIONS` into `local_db`. This is a list in the running Python process, not a database. The copy lets this instance add items without changing the original top-level list.
- `SearchEngine.search(...)` applies filters, ranks matches, and returns one page:
  1. It starts with all questions in `local_db`.
  2. If an interview type is provided, it keeps questions with an exact, case-insensitive type match.
  3. If a difficulty is provided, it keeps questions with an exact, case-insensitive difficulty match.
  4. If a company is provided, it keeps questions whose company list contains an exact, case-insensitive match.
  5. If a text query is provided, it checks whether that text occurs inside the title, description, any topic tag, or any company tag, ignoring letter case. A title match adds 2 ranking points; a description match adds 1; and a topic-tag match adds 1. A company-tag text match makes the question a result but adds no ranking points.
  6. Matching questions are sorted from highest score to lowest. If scores tie, Python's stable sort keeps their previous order.
  7. It calculates `total` before pagination, then uses `offset` and `limit` to select the returned page.
  8. It returns a dictionary with `questions`, `total`, and the original `query`.
- `SearchEngine.get_question_by_id(question_id)` returns the first question whose ID exactly equals the requested ID, or `None` if no match exists.
- `SearchEngine.get_random_question(...)` applies the same optional case-insensitive type, difficulty, and exact company filters. It returns a random match, or `None` if the filtered list is empty.
- `SearchEngine.add_question(question)` appends the given dictionary to `local_db` and returns `True`.
- `search_engine = SearchEngine()` creates one shared engine when the module is loaded. The API routes use this shared instance.

The search and random methods are marked `async`, but they do not perform network or database operations. They work with the in-memory list.

### `app/questions_seed.py` — provide the starting question catalog

- The imports provide UUID generation.
- `make_id()` returns a newly generated UUID string. The current seed records use readable fixed IDs, so this helper is available but is not used to assign IDs to those records.
- `SEED_QUESTIONS` is the initial list of question dictionaries. It contains 156 records according to the service README. The records cover data structures and algorithms, system design, and behavioral interview topics.
- Each question follows the shape expected by `Question`: an ID, title, description, interview type, difficulty, topic tags, company tags, and hints. The individual records are data, not separate functions; they are intentionally not repeated in this guide.
- Comments dividing the list into sections label groups of question records.

### `app/__init__.py` — package description

This file's text describes the Python package. It does not define classes or functions. Some statements in its description refer to fuzzy matching, autocomplete, an inverted index, TF-IDF, BM25, and Levenshtein matching. Those features are not present in the current `search_engine.py`; the actual search is a direct scan with substring matching and simple scoring.

### `app/test_search.py` — automated checks

- The imports provide pytest, asynchronous mocks, patching, FastAPI's test client, and the real `SearchEngine` class.
- `MOCK_QUESTION`, `MOCK_SEARCH_RESPONSE`, and `MOCK_BEHAVIORAL_QUESTION` are example records used by the tests.
- The `client` fixture replaces the route's engine with a mock. It makes each route test predictable, imports the FastAPI application, opens a test client, and yields the client together with the mock.
- `TestHealthAndRoot` checks that the health and root endpoints respond with the expected service information:
  - `test_health_check()` checks the status, service name, and nonzero question count from `/health`.
  - `test_root_endpoint()` checks the service-identification message from `/`.
- `TestSearchQuestions` checks different query parameter combinations:
  - `test_search_with_query()` sends a text query and checks the returned question.
  - `test_search_with_type_filter()` checks the interview-type filter.
  - `test_search_with_difficulty_filter()` checks the difficulty filter.
  - `test_search_with_company_filter()` checks the company filter.
  - `test_search_with_pagination()` checks that page size and offset are accepted.
  - `test_search_no_params()` checks that searching without filters succeeds.
  - `test_search_invalid_limit()` checks that a page size below 1 is rejected.
  - `test_search_limit_too_high()` checks that a page size above 100 is rejected.
- `TestRandomQuestion` checks random selection:
  - `test_get_random_question()` checks an unfiltered random selection.
  - `test_get_random_question_with_type()` checks selection by interview type.
  - `test_get_random_question_with_difficulty()` checks selection by difficulty.
  - `test_get_random_question_with_company()` checks the filters passed to the engine.
  - `test_get_random_question_none_found()` checks the 404 response when the engine finds no match.
- `TestQuestionById` checks lookups:
  - `test_get_question_by_id()` checks a successful lookup.
  - `test_get_question_not_found()` checks the 404 response for a missing ID.
  - `test_get_question_has_tags()` checks that tags are present in the response.
- `TestCreateQuestion` checks question creation:
  - `test_create_question()` checks adding a complete question.
  - `test_create_question_auto_id()` sends an empty ID and checks that the response contains a generated one.
  - `test_create_question_missing_fields()` checks that an incomplete body is rejected.
- `TestInMemorySearchEngine` uses a real `SearchEngine` rather than the route mock:
  - `test_search_filters_and_ranks_seeded_questions()` checks case-insensitive search and all three filters on seeded data.
  - `test_search_paginates_actual_catalog()` checks paging on the real catalog.
  - `test_random_question_matches_case_insensitive_filters()` checks random selection with type, difficulty, and company filters.
  - `test_add_question_updates_current_process_catalog()` checks that a newly added item can be found in that engine instance.

Most route tests verify the API response using a mocked engine. The final engine tests exercise the actual list filtering and update logic.

### `README.md` — service overview and run instructions

The README explains the request flow, endpoints, in-memory storage, and how to run tests or start the container. Treat it as project documentation rather than executable code. Two details differ from the implementation:

- It lists `GET /health` among the Search API endpoints, but the health route is `/health`, outside the `/api/v1/search` prefix.
- It describes the search parameter as `q` for the HTTP endpoint, while the `SearchRequest` model calls the equivalent field `query`. The route uses `q` and passes it to the engine as `query`.

### `requirements.txt` — Python libraries

This file pins the service's Python dependencies to specific versions:

- `fastapi` provides the HTTP API framework.
- `uvicorn[standard]` runs the ASGI web application.
- `pydantic` validates and formats the data models.

### `Dockerfile` — build and run the service container

- `FROM python:3.11-slim` chooses a small Python 3.11 base image.
- `WORKDIR /app` sets the working directory inside the container.
- `COPY requirements.txt .` copies the dependency list into the image.
- `RUN pip install ...` installs the listed Python packages without keeping pip's download cache.
- `COPY . .` copies the service files into the image.
- `EXPOSE 8013` documents the port used by the service.
- `CMD [...]` starts Uvicorn, serves `app.main:app` on all container network interfaces, and listens on port 8013.

### `uploads/` — files directory

The service folder contains an `uploads` directory. It is not used by the Search Service source files described here.

## API endpoint summary

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/health` | Reports service health and the current question count. |
| `GET` | `/` | Identifies the service. |
| `GET` | `/api/v1/search/questions` | Searches, filters, ranks, and paginates questions. |
| `GET` | `/api/v1/search/questions/random` | Returns a random question matching optional filters, or 404. |
| `GET` | `/api/v1/search/questions/{question_id}` | Returns the question with that exact ID, or 404. |
| `POST` | `/api/v1/search/questions` | Adds a question to this process's memory. |

## Important limitations

- Search is case-insensitive substring matching, not fuzzy or typo-tolerant search.
- Every search scans the in-memory question list; there is no search index or persistent database.
- Questions added with the POST endpoint disappear when the process restarts.
- The POST endpoint currently has no authentication check and does not prevent duplicate IDs.
- The package description and some code comments mention capabilities such as autocomplete, BM25/TF-IDF, and an inverted index that the current code does not implement.