# Frontend Docker Configuration
FROM docker.m.daocloud.io/library/node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (using Taobao mirror for faster downloads in China)
RUN npm ci --registry=https://registry.npmmirror.com

# Copy source code
COPY . .

# Ensure public directory exists (Next.js doesn't require it, but COPY below does)
RUN mkdir -p /app/public

# BACKEND_URL is read by next.config.js rewrites() at build time.
# Default to the Docker-internal service name; override with --build-arg if needed.
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL

# Build the application
RUN npm run build

# Production runner
FROM docker.m.daocloud.io/library/node:18-alpine

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000 || exit 1

CMD ["node", "server.js"]
