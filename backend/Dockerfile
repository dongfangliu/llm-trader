# Backend Docker Configuration
FROM docker.m.daocloud.io/library/python:3.11-slim

WORKDIR /app

# Use Aliyun apt mirror for faster downloads in China
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list 2>/dev/null || true

# Install system dependencies (libpq-dev for asyncpg/psycopg2, supervisor for process management)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies (using Tsinghua mirror)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn

# Copy source code and runtime config
COPY src/ ./src/
COPY initial_settings.json .
COPY supervisord.conf /app/supervisord.conf

# Create data and logs directories
RUN mkdir -p /app/data /app/logs

# Expose port
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Run all processes via supervisor
CMD ["supervisord", "-c", "/app/supervisord.conf"]
