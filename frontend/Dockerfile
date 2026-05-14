# Frontend Docker Configuration — Nuxt 3
FROM docker.m.daocloud.io/library/node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (using Taobao mirror for faster downloads in China)
RUN npm install --registry=https://registry.npmmirror.com

# Copy source code
COPY . .

# Download NotoSansSC OTF fonts for Satori card generation
RUN mkdir -p public/fonts && \
    (wget -q -O public/fonts/NotoSansSC-Regular.otf \
    "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf" && \
    wget -q -O public/fonts/NotoSansSC-Bold.otf \
    "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf" && \
    wget -q -O public/fonts/NotoSansSC-Black.otf \
    "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Black.otf") || \
    echo "Font download failed, will use system/CDN fallback at runtime"; \
    find public/fonts -type f -size -1024c -delete

# Build Nuxt app (outputs to .output/)
RUN npm run build

# Production runner
FROM docker.m.daocloud.io/library/node:20-alpine

WORKDIR /app

RUN apk add --no-cache font-noto-cjk

# Copy built output — Nuxt 3 self-contained server in .output/
COPY --from=builder /app/.output ./

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000 || exit 1

CMD ["node", "server/index.mjs"]
