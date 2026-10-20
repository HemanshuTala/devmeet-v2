# DevMeet v2.0 — Playwright End-to-End Test Plan

**Framework:** `@playwright/test` v1.64.1  
**Execution Mode:** Headless Chromium, 1 Worker (deterministic), Single Test Run  
**Base URL:** `http://localhost:3000`  
**API Gateway:** `http://localhost:8000`  

---

## 1. Test Suite Architecture

| Spec File | Area Under Test | Key Assertions |
|---|---|---|
| `e2e/auth-flow.spec.ts` | Guest & Authentication | Form validation, login inputs, register redirection, forgot-password recovery. |
| `e2e/dashboard-and-questions.spec.ts` | Navigation Performance | Instant transition from Dashboard to Question Bank (< 1,500ms target), search debouncing, type/difficulty filters, practice routing. |
| `e2e/code-editor.spec.ts` | Studio & Billing Controls | Step wizard track/difficulty selection in Create Session, plans rendering on `/billing`. |
| `e2e/api-contracts.spec.ts` | Distributed Network Integration | `X-Request-ID` propagation, search service schema validation, gateway health probe. |
| `e2e/interview-studio.spec.ts` | Session Fallbacks | Unauthenticated route handling, track option rendering. |
| `e2e/landing-and-navigation.spec.ts` | Public Landing & Brand | Hero banner, CTA navigation, terms & privacy pages, pricing display. |
| `e2e/theme-and-accessibility.spec.ts` | Design System Tokens | Brand blue tokens, font variables, navbar typography. |

---

## 2. Test Execution Commands

```bash
# Run all end-to-end tests
cd frontend && npx playwright test

# Run a specific spec with verbose logs
cd frontend && npx playwright test e2e/dashboard-and-questions.spec.ts

# Inspect trace logs on failure
npx playwright show-trace test-results/.../trace.zip
```
