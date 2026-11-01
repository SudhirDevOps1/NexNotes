# NexNotes — production image (multi-stage, standalone Next.js output)
# Build:  docker build -t nexnotes .
# Run:    docker run -p 3000:3000 -v nexnotes_data:/app/db nexnotes

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# default SQLite schema; pass --build-arg DB_SCHEMA=postgres for Neon/Postgres
ARG DB_SCHEMA=sqlite
ENV DATABASE_URL="file:./db/custom.db"
RUN ./node_modules/.bin/prisma generate \
 && ./node_modules/.bin/next build \
 && cp -r .next/static .next/standalone/.next/ \
 && cp -r public .next/standalone/

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/app/db/custom.db"

# non-root user
RUN addgroup --system --gid 1001 nexnotes \
 && adduser --system --uid 1001 nexnotes \
 && mkdir -p /app/db && chown -R nexnotes:nexnotes /app/db

COPY --from=builder --chown=nexnotes:nexnotes /app/.next/standalone ./
COPY --from=builder --chown=nexnotes:nexnotes /app/prisma ./prisma

USER nexnotes
EXPOSE 3000
VOLUME ["/app/db"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server.js"]
