# ---------------------------------------------------------------------------
# Kairo multi-stage Dockerfile
# Next.js 15 (frontend) + the plain-TypeScript core in ../backend
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Stage 1: dependencies
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN cd frontend && npm ci

# ---------------------------------------------------------------------------
# Stage 2: build
#
# NEXT_PUBLIC_* variables are inlined into the client bundle by the compiler at
# BUILD time. Supplying them only via `docker run --env-file` is too late —
# there is nothing left to substitute — so the browser bundle ships
# `undefined` for the Supabase URL and anon key. Every server route keeps
# working (those read process.env at runtime), which makes the config look
# fine while "Continue with Google" silently does nothing.
#
# They must therefore arrive as build args. They are public by design: the
# anon key is safe in a browser bundle and is protected by row-level security.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_DEMO_MODE="false"

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY backend ./backend
COPY frontend ./frontend

# Fail the build rather than ship an image whose sign-in cannot work.
RUN if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then \
      echo ""; \
      echo "ERROR: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be passed as"; \
      echo "       build args. They are compiled into the browser bundle, so setting them at"; \
      echo "       'docker run' time cannot work and sign-in would fail silently."; \
      echo ""; \
      echo "  docker build \\"; \
      echo "    --build-arg NEXT_PUBLIC_SUPABASE_URL=... \\"; \
      echo "    --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... -t kairo-app ."; \
      echo ""; \
      exit 1; \
    fi

# Allocate 2GB memory for Node during the build
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN cd frontend && npm run build

# ---------------------------------------------------------------------------
# Stage 3: runner
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: run as an unprivileged user.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# `--chown` matters: Next writes to .next/cache at runtime, and a root-owned
# tree makes every render log a permissions warning and lose its ISR cache.
COPY --from=builder --chown=nextjs:nodejs /app/backend ./backend
COPY --from=builder --chown=nextjs:nodejs /app/frontend ./frontend

WORKDIR /app/frontend

USER nextjs

EXPOSE 3000

# /api/health reports missing config as 503, so an unhealthy container is
# visible to the orchestrator instead of serving broken pages.
# busybox wget ships with alpine, so this needs no extra package.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "start"]
