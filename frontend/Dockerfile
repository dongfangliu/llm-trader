# Frontend Docker Configuration — Nuxt 3
FROM docker.m.daocloud.io/library/node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (using Taobao mirror for faster downloads in China)
RUN npm install --registry=https://registry.npmmirror.com

# Copy source code
COPY . .

# Build Nuxt app (outputs to .output/)
RUN npm run build

# Production runner
FROM docker.m.daocloud.io/library/node:20-alpine

WORKDIR /app

# Copy built output — Nuxt 3 self-contained server in .output/
COPY --from=builder /app/.output ./

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000 || exit 1

CMD ["node", "server/index.mjs"]
