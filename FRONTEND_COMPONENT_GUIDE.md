# DevMeet Frontend Component Architecture & Guide

This guide documents the modular component hierarchy, directory conventions, prop specifications, and state flows across the DevMeet Next.js 14 frontend application.

---

## 1. Directory Structure & Responsibilities

```text
frontend/src/
├── app/                        # Next.js 14 App Router (pages & route handlers)
│   ├── (auth)/                 # /login, /register, /forgot-password, /reset-password
│   ├── dashboard/              # Candidate dashboard, history, questions, leaderboard
│   ├── interview/              # Active real-time interview room, feedback, and replay
│   ├── profile/                # Identity, target companies, skills, billing
│   ├── billing/                # Razorpay checkout, subscription management
│   ├── admin/                  # System administration console
│   └── (legal)/                # /privacy, /terms
│
├── components/
│   ├── ui/                     # Base design primitives (button, input, modal, badge, card)
│   ├── layout/                 # DashboardShell, Navbar, PageLayout, MobileBlocker
│   ├── landing/                # Landing page decomposed sections
│   │   ├── LandingHeader.tsx
│   │   ├── FloatingCodeBlock.tsx
│   │   ├── InterviewStudioMockup.tsx
│   │   ├── InterviewModesSection.tsx
│   │   ├── ProctoringShowcaseSection.tsx
│   │   ├── PricingSection.tsx
│   │   ├── FaqSection.tsx
│   │   └── LandingFooter.tsx
│   ├── billing/                # Modular subscription & checkout components
│   │   ├── PlanCard.tsx
│   │   ├── BillingHistoryTable.tsx
│   │   └── BillingFaq.tsx
│   ├── admin/                  # Administrative monitoring components
│   │   ├── AdminStatCards.tsx
│   │   ├── AdminUserTable.tsx
│   │   ├── AdminAuditLogsTable.tsx
│   │   └── AdminSystemHealth.tsx
│   ├── interview/              # Active session UI widgets
│   │   ├── video/              # Modular WebRTC & LiveKit components
│   │   │   ├── AudioLevelMeter.tsx
│   │   │   ├── DeviceSettingsOverlay.tsx
│   │   │   ├── ProctorOverlays.tsx
│   │   │   ├── AIAvatarState.tsx
│   │   │   ├── NetworkStatsCard.tsx
│   │   │   └── LiveKitStatusBadge.tsx
│   │   ├── ChatPanel.tsx
│   │   ├── CodeEditorPanel.tsx
│   │   └── VideoPanel.tsx
│   └── feedback/               # EmptyState, ErrorAlert, PageLoader
```

---

## 2. Core Feature Components & Prop Contracts

### 2.1 LiveKit & Video Modules (`src/app/interview/video/`)

#### `AudioLevelMeter.tsx`
- **Purpose**: Subscribes to Web Audio API analyzer nodes and animates green volume LED bars.
- **Props**:
  - `subscribe: (cb: (level: number) => void) => () => void`: Listener function provided by `useAudioLevel`.
  - `size?: 'sm' | 'md'`: Size variant for compact or full video panels.

#### `DeviceSettingsOverlay.tsx`
- **Purpose**: Floating settings modal allowing candidates to swap hardware camera and microphone sources on the fly.
- **Props**:
  - `videoDevices`: Array of detected `MediaDeviceInfo` cameras.
  - `audioDevices`: Array of detected `MediaDeviceInfo` microphones.
  - `selectedVideoId`: Currently active camera `deviceId`.
  - `selectedAudioId`: Currently active microphone `deviceId`.
  - `onChangeVideo`: Callback to update video track device constraint.
  - `onChangeAudio`: Callback to update audio track device constraint.

#### `ProctorOverlays.tsx`
- **Purpose**: Displays anti-cheating warning banners (face gaze diversion, phone detected, multiple faces) and camera disabled placeholders.
- **Props**:
  - `activeWarning: string | null`: Gaze diversion or multiple person detection alert.
  - `modelsLoaded: boolean`: State of MediaPipe Face Mesh & COCO-SSD weights.
  - `videoActive: boolean`: Camera track enabled/disabled state.

#### `AIAvatarState.tsx`
- **Purpose**: Animates dynamic audio frequency bars when AI is speaking, dual rotating rings when evaluating, or volume icon when idle.
- **Props**:
  - `aiState: 'speaking' | 'thinking' | 'idle' | string`.

#### `LiveKitStatusBadge.tsx`
- **Purpose**: Visual pill badge showing LiveKit SFU WebRTC room connection state (`connected`, `connecting`, `failed`, or `mock`).

---

### 2.2 Billing & Subscription Modules (`src/components/billing/`)

#### `PlanCard.tsx`
- **Purpose**: Displays pricing tier details, monthly vs. annual pricing calculations in INR, feature checkmarks, and handles Razorpay checkout triggers.
- **Props**:
  - `plan: PlanItem`: Plan metadata (name, amount, features).
  - `currentPlan: string`: User's currently active plan ('free', 'pro', 'enterprise').
  - `isAnnual: boolean`: Annual discount state (20% off).
  - `onUpgrade: (planId: string) => void`: Checkout trigger function.

#### `BillingHistoryTable.tsx`
- **Purpose**: Render table of past Razorpay orders, tax receipts, and payment statuses.
- **Props**:
  - `events: BillingEvent[]`: Array of invoice and transaction logs.

#### `BillingFaq.tsx`
- **Purpose**: Interactive accordion answering common billing, cancellation, and payment method inquiries.

---

### 2.3 System Administration Modules (`src/components/admin/`)

#### `AdminStatCards.tsx`
- **Purpose**: Displays high-level platform KPIs (Total Users, Sessions Today, Blocked Accounts, Estimated Monthly Recurring Revenue).
- **Props**:
  - `stats: AdminStats | null`.
  - `loading: boolean`.

#### `AdminUserTable.tsx`
- **Purpose**: Searchable, filterable candidate directory supporting account blocking/unblocking, plan tier overrides, user impersonation, and GDPR anonymization.

#### `AdminAuditLogsTable.tsx`
- **Purpose**: Immutable activity log table with chronological event filtering and CSV export.

#### `AdminSystemHealth.tsx`
- **Purpose**: Topology status showing all 10 microservice ports, plan distribution bars, and quick links to RabbitMQ, Prometheus, and Grafana.

---

## 3. Data Flow & State Management Patterns

1. **Server State (TanStack React Query v5)**:
   - Used for asynchronous API synchronization (`useProfile`, `useSession`, `useQuestionSearch`, `usePlan`).
   - Handles automatic caching, background revalidation on window focus, and optimistic updates.
2. **Client State (React Context & Hooks)**:
   - `AuthContext`: Tracks authenticated user profile, JWT token lifecycle, and role permissions.
   - `useWebRTC`: Manages LiveKit client room lifecycle, token acquisition, and network telemetry.
   - `useMediaStream`: Interacts with browser `navigator.mediaDevices` hardware streams.
3. **HTTP Transport Layer (`api.ts`)**:
   - Centralized fetch wrapper targeting API Gateway at `http://localhost:8000`.
   - Injects Bearer tokens automatically from `localStorage`.
   - Automatically intercepts `401 Unauthorized` responses to refresh tokens and retry requests transparently.
