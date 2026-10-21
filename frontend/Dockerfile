# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Build the Next.js app
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# MUST create public dir BEFORE next build runs — Next.js needs it to exist
# and the runner stage COPYs from this builder stage's filesystem
RUN mkdir -p public

ARG NEXT_PUBLIC_GATEWAY_URL=http://api-gateway:8000
ARG NEXT_PUBLIC_API_URL=http://api-gateway:8000
ARG NEXT_PUBLIC_AUTH_URL=http://auth-service:8001
ARG NEXT_PUBLIC_USER_URL=http://user-service:8002
ARG NEXT_PUBLIC_ORCH_URL=http://orchestrator-service:8003
ARG NEXT_PUBLIC_AI_URL=http://ai-interviewer-service:8004
ARG NEXT_PUBLIC_EXEC_URL=http://code-execution-service:8005
ARG NEXT_PUBLIC_VIDEO_URL=http://video-service:8006
ARG NEXT_PUBLIC_FEEDBACK_URL=http://feedback-service:8007
ARG NEXT_PUBLIC_ANALYTICS_URL=http://analytics-service:8009
ARG NEXT_PUBLIC_ADMIN_URL=http://admin-service:8010
ARG NEXT_PUBLIC_FILE_URL=http://file-service:8011
ARG NEXT_PUBLIC_PAYMENT_URL=http://payment-service:8012
ARG NEXT_PUBLIC_SEARCH_URL=http://search-service:8013

ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_USER_URL=$NEXT_PUBLIC_USER_URL
ENV NEXT_PUBLIC_ORCH_URL=$NEXT_PUBLIC_ORCH_URL
ENV NEXT_PUBLIC_AI_URL=$NEXT_PUBLIC_AI_URL
ENV NEXT_PUBLIC_EXEC_URL=$NEXT_PUBLIC_EXEC_URL
ENV NEXT_PUBLIC_VIDEO_URL=$NEXT_PUBLIC_VIDEO_URL
ENV NEXT_PUBLIC_FEEDBACK_URL=$NEXT_PUBLIC_FEEDBACK_URL
ENV NEXT_PUBLIC_ANALYTICS_URL=$NEXT_PUBLIC_ANALYTICS_URL
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_FILE_URL=$NEXT_PUBLIC_FILE_URL
ENV NEXT_PUBLIC_PAYMENT_URL=$NEXT_PUBLIC_PAYMENT_URL
ENV NEXT_PUBLIC_SEARCH_URL=$NEXT_PUBLIC_SEARCH_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Production runner
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public dir from builder (guaranteed to exist because of mkdir above)
COPY --from=builder /app/public ./public

# Copy standalone server and static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
