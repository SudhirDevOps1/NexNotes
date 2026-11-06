# NexNotes — production image (multi-stage, standalone Next.js output)
# Build:  docker build -t nexnotes .
# Run:    docker run -p 3000:3000 -v nexnotes_data:/app/db nexnotes

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
# the root package runs scripts/postinstall.mjs on install — the script dir
# must be here or bun dies with "Module not found" before its own skip-logic
# gets a chance (this is what broke the v0.4.0 tag build). Both steps it runs
# degrade to warnings when their inputs (prisma/, env) aren't there yet.
COPY scripts ./scripts
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# default SQLite schema; pass --build-arg DB_SCHEMA=postgres for Neon/Postgres
# (the arg is read by scripts/pick-schema.mjs BEFORE generate — it used to be
# documented but never actually read, so "postgres" builds shipped SQLite)
ARG DB_SCHEMA=sqlite
ENV DATABASE_URL="file:./db/custom.db"
RUN node scripts/pick-schema.mjs "$DB_SCHEMA" \
 && ./node_modules/.bin/prisma generate \
 && ./node_modules/.bin/next build \
 && node scripts/finish-build.mjs

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/app/db/custom.db"

# non-root user — written straight into /etc/{group,passwd} because the
# slim base ships neither adduser nor useradd (first tag build died with
# exit 127 right here)
RUN echo "nexnotes:x:1001:" >> /etc/group \
 && echo "nexnotes:x:1001:1001::/app:/bin/false" >> /etc/passwd \
 && mkdir -p /app/db && chown -R nexnotes:nexnotes /app/db

COPY --from=builder --chown=nexnotes:nexnotes /app/.next/standalone ./
COPY --from=builder --chown=nexnotes:nexnotes /app/prisma ./prisma

USER nexnotes
EXPOSE 3000
VOLUME ["/app/db"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server.js"]
