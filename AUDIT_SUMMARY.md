# DevMeet v2.0 — Executive Audit Summary for Technical Interviews

> **Mentor's Note**: This summary is written in clear, conversational English. It is designed to help you confidently understand, navigate, and explain the DevMeet architecture, its strengths, and its real-world engineering trade-offs during a technical interview.

---

## 1. What Does DevMeet Actually Do?

Think of **DevMeet** as an automated, full-fledged technical interviewer.

When you practice coding on traditional platforms like LeetCode or HackerRank, you only get a static text problem and a test-case submit button. But in a real technical interview at companies like Google or Amazon, a human interviewer speaks with you, asks follow-up questions, gives hints when you get stuck, checks your communication skills, and watches how you explain your thought process.

**DevMeet recreates that complete live interview experience:**
1. **Live AI Interviewer**: An AI avatar speaks with you, gives you a technical problem, listens to your ideas, and asks follow-up questions in real time using Groq's high-speed LLaMA 3.3 model.
2. **Real-Time Token Streaming**: Instead of waiting 10 seconds for the entire AI response to generate, tokens stream to your screen instantly over **Server-Sent Events (SSE)**.
3. **Audio & Video Interaction**: You can speak your answers via microphone (transcribed by Groq Whisper) and connect your webcam via WebRTC.
4. **Sandboxed Code Execution**: You write code in Monaco (the editor powering VS Code), and the system executes your solution in an isolated environment with a 5-second CPU limit and 256MB memory cap.
5. **Anti-Cheating Proctoring**: The system tracks whether a candidate switches browser tabs or pastes external code.
6. **Automated 6D Scoring & PDF Report**: Once you finish, an automated evaluation engine grades your performance across 6 dimensions (Algorithms, Code Quality, Architecture, Behavioral, Communication, Edge Cases) and compiles a downloadable PDF report.
7. **Tiered Billing**: Integrated with Razorpay so users can practice on a Free plan (5 interviews/month) or upgrade to Pro (30 interviews/month).

---

## 2. How the Frontend Connects to the Microservices

Instead of having the browser call 12 different ports directly, DevMeet uses an **API Gateway pattern**:
- The Next.js 14 frontend sends all requests to a single entry point: `http://localhost:8000`.
- An **Nginx reverse proxy** listens on port 8000. It handles Cross-Origin Resource Sharing (CORS), rate limiting, and routes requests to the correct internal microservice:
  - `/api/v1/auth/*` goes to `auth-service` (:8001).
  - `/api/v1/users/*` goes to `user-service` (:8002).
  - `/api/v1/sessions/*` goes to `orchestrator-service` (:8003).
  - `/api/v1/interview/*` goes to `ai-interviewer-service` (:8004).
  - `/api/v1/execute/*` goes to `code-execution-service` (:8005).
  - `/api/v1/video/*` goes to `video-service` (:8006).
  - `/api/v1/feedback/*` goes to `feedback-service` (:8007).
  - `/api/v1/analytics/*` goes to `analytics-service` (:8009).
  - `/api/v1/admin/*` goes to `admin-service` (:8010).
  - `/api/v1/files/*` goes to `file-service` (:8011).
  - `/api/v1/payments/*` goes to `payment-service` (:8012).
  - `/api/v1/search/*` goes to `search-service` (:8013).

---

## 3. Microservice Roles in Simple English

| Microservice | Port | What It Does | Why It Exists Separately |
| :--- | :---: | :--- | :--- |
| **`api-gateway`** | 8000 | Traffic controller (Nginx). | Keeps the frontend simple by providing one single base URL and enforcing security headers. |
| **`auth-service`** | 8001 | Passwords, tokens, and 2FA. | Secures identity; uses Argon2/Bcrypt and PyOTP for Google Authenticator 2-factor login. |
| **`user-service`** | 8002 | Candidate profiles and quotas. | Keeps track of who you are, how many practice interviews you have left, and your target companies. |
| **`orchestrator-service`** | 8003 | The interview coordinator. | The central state machine. Starts interviews, tracks dialog turns, monitors cheating, and marks sessions finished. |
| **`ai-interviewer-service`** | 8004 | The AI brain. | Talks to Groq LLaMA 3.3 and Whisper. Includes a circuit breaker so the app doesn't crash if Groq is slow. |
| **`code-execution-service`** | 8005 | The code runner sandbox. | Runs Python, JavaScript, Java, C++, Go. Kills infinite loops after 5 seconds to protect the server. |
| **`video-service`** | 8006 | WebRTC camera & audio coordinator. | Mints LiveKit video tokens and checks that your camera and microphone work before starting. |
| **`feedback-service`** | 8007 | The report card generator. | Uses AI to grade your interview across 6 metrics and compiles an executive PDF report. |
| **`analytics-service`** | 8009 | Performance metrics and charts. | Shows your score trend line over time so you can see if your interview skills are improving. |
| **`admin-service`** | 8010 | The administrator dashboard. | Lets staff members view platform stats, view audit logs, and ban abusive accounts. |
| **`file-service`** | 8011 | The file storage cabinet. | Uploads profile pictures and code snapshots to AWS S3 (or saves them locally if offline). |
| **`payment-service`** | 8012 | Cash register and billing. | Integrates Razorpay to upgrade users from Free to Pro plans with HMAC security checks. |
| **`search-service`** | 8013 | The question library. | Stores over 2,000+ real interview problems and quickly picks a random question for your practice session. |

---

## 4. What Works and Has Been Verified

1. **Automated Unit Tests**:
   - All **220 microservice unit tests** pass with 100% success rate (`python scripts/run_all_tests.py`).
2. **Frontend Type Safety**:
   - The Next.js 14 frontend compiles cleanly with **0 TypeScript errors** (`npx tsc --noEmit`).
3. **Core Infrastructure**:
   - PostgreSQL 16 is live with all 16 public tables populated and verified.
   - Redis 7.2 is live with active rate limiters and token state.
   - RabbitMQ 3.12 is live on port 5672 with durable message queues.
4. **All 13 Service Endpoints**:
   - Every single service (`api-gateway`, `auth`, `user`, `orchestrator`, `ai`, `code`, `video`, `feedback`, `analytics`, `admin`, `file`, `payment`, `search`) is running and responds with HTTP 200 on its health endpoint.
5. **Gateway Routing**:
   - Verified live routing through Nginx for `/api/v1/payments/config` (Razorpay) and `/api/v1/search/questions/random` (Question Bank).

---

## 5. What Was Removed & What Was Kept

- **`notification-service` (:8008) Was Safely Deleted**:
  - The frontend had commented out notifications; Nginx did not route to it; it was omitted from Docker Compose.
  - Per your explicit approval, the folder was deleted, dead stubs in the frontend were removed, and email notifications in `auth-service` were redirected to local logging.
- **`file-service` (:8011) Was Retained**:
  - Per your explicit confirmation, `file-service` was kept intact because candidate avatar uploads (`user-service`) and code snapshots (`code-execution-service`) rely on it.

---

## 6. What Requires Manual Testing

Follow [Manual Testing Plan](MANUAL_TESTING_PLAN.md) to test:
1. Candidate registration and logging in with Google Authenticator TOTP 2FA.
2. Creating an interview session and observing live AI token streaming over SSE.
3. Running valid Python code and testing an infinite loop to verify the 5-second timeout.
4. Completing a session and downloading the compiled PDF evaluation report.
5. Upgrading to the Pro tier using the sandbox mock checkout.
