# DevMeet Frontend (`frontend/`)

## 1. Overview

The `frontend/` directory contains the modern, responsive web application for DevMeet v2.0, built using **Next.js 14 (App Router)**, **React 18**, **TypeScript**, and **Tailwind CSS**.

### Key Technical Capabilities
- **Monaco Code Editor**: Embedded VS Code editing engine with syntax highlighting, language selector (Python, JS, Java, C++, Go, Rust), and Vim/Emacs keybinding support.
- **Client-Side Edge AI Proctoring**: Uses Google MediaPipe Face Mesh and TensorFlow.js COCO-SSD to detect gaze deviation, face count, and cell phone presence entirely in the user's browser with 0ms camera latency and zero backend GPU costs.
- **Dual Speech Recognition**: Uses browser-native Web Speech API for instantaneous transcription with zero API costs, backed by Groq Whisper REST fallback.
- **Server-Sent Events (SSE) Consumer**: Consumes real-time LLM token streams from `ai-interviewer-service` for smooth live dialogue.
- **State Management & Caching**: Combines Zustand for client-side state and TanStack React Query v5 for server state caching and synchronization.

---

## 2. Directory Structure

```text
frontend/
├── src/
│   ├── app/                 # Next.js 14 App Router pages & layouts
│   │   ├── admin/           # Administrative monitoring & user management
│   │   ├── analytics/       # Performance trends & score charts (Recharts)
│   │   ├── billing/         # Razorpay checkout & subscription plans
│   │   ├── dashboard/       # Candidate interview history & quick launch
│   │   ├── interview/       # Live interactive interview interface (Editor, Video, Chat)
│   │   ├── login/           # Authentication portal
│   │   ├── register/        # Candidate onboarding
│   │   ├── profile/         # Candidate target companies & skills
│   │   ├── layout.tsx       # Root layout & providers
│   │   └── page.tsx         # Landing page
│   ├── components/          # Reusable UI components (Radix UI / Tailwind)
│   │   ├── auth/            # Login, register, and password forms
│   │   ├── interview/       # Monaco editor, audio visualizer, proctoring overlay
│   │   ├── layout/          # Navbar, sidebar, footer
│   │   └── ui/              # Radix primitives (dialog, toast, dropdown, tabs)
│   ├── contexts/            # React Contexts (AuthContext)
│   ├── hooks/               # Custom hooks (speech, proctoring, network quality)
│   ├── lib/                 # Utility libraries (api client, error handling, speech)
│   ├── providers/           # QueryProvider, ThemeProvider
│   └── stores/              # Zustand stores (uiStore)
├── next.config.js           # API rewrites & Docker standalone config
├── package.json
└── tsconfig.json
```

---

## 3. Development & Build Commands

```bash
# Navigate to frontend
cd frontend

# Verify TypeScript type check
npx tsc --noEmit

# Run Next.js in development mode
npm run dev

# Build standalone production bundle
npm run build
```

---

## 4. Common Technical Interview Questions & Answers

### Q1: Why perform AI proctoring on the client side with TensorFlow.js / MediaPipe instead of sending video streams to a backend GPU server?
> **Answer**: Running computer vision models on the server requires streaming 30 FPS video per candidate over WebRTC to expensive cloud GPU instances (such as AWS G4dn/G5), creating high bandwidth bills and compute costs ($1-3/hr per active candidate). By executing lightweight MediaPipe Face Mesh and TensorFlow.js models directly in the user's browser via WebGL/WebAssembly:
> 1. Compute cost to the platform is $0.
> 2. Privacy is preserved because raw camera video never leaves the candidate's device.
> 3. Detection latency is instantaneous (0 network round-trip delay).

### Q2: How does the frontend handle API routing between local development and production Docker environments?
> **Answer**: In `next.config.js`, we configure Next.js `rewrites()` to map `/api/v1/:service/:path*` to the internal API gateway URL (`NEXT_PUBLIC_GATEWAY_URL`). In local development, it proxies to `http://localhost:8000`, while in production Docker containers, it connects directly across the Docker bridge network.

### Q3: How is token lifecycle and unauthorized API recovery handled in the frontend?
> **Answer**: `src/lib/api.ts` implements a transparent token refresh interceptor. All API requests automatically append the Bearer access token from `localStorage`. If the backend returns `401 Unauthorized`, the client intercepts the response, executes `apiClient.refreshToken()`, persists the newly rotated JWT pair, and retries the original request seamlessly without requiring candidate re-authentication.

---

## 5. Audit & Design Documentation

For complete technical specifications and audit findings, refer to:
- [`../FRONTEND_AUDIT.md`](../FRONTEND_AUDIT.md) — Comprehensive audit report across all 20 application routes.
- [`../FRONTEND_DESIGN_SYSTEM.md`](../FRONTEND_DESIGN_SYSTEM.md) — Design tokens, color palette, typography, and responsive conventions.
- [`../FRONTEND_API_INTEGRATION.md`](../FRONTEND_API_INTEGRATION.md) — Gateway mapping and microservice API integration matrix.
- [`../FRONTEND_TESTING_PLAN.md`](../FRONTEND_TESTING_PLAN.md) — Automated and manual testing checklists.
- [`../FRONTEND_PROGRESS.md`](../FRONTEND_PROGRESS.md) — Phase-by-phase implementation progress.
