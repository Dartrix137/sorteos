FROM oven/bun:1

WORKDIR /app

# Install Caddy
RUN apt-get update && apt-get install -y curl ca-certificates openssl && \
    CADDY_VERSION="2.9.1" && \
    curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz" \
    -o /tmp/caddy.tar.gz && \
    tar -xzf /tmp/caddy.tar.gz -C /usr/local/bin caddy && \
    rm /tmp/caddy.tar.gz && \
    chmod +x /usr/local/bin/caddy && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install dependencies (layer cache)
COPY package.json bun.lockb* package-lock.json* ./
COPY prisma ./prisma/
COPY mini-services/sorteo-ws/package.json ./mini-services/sorteo-ws/

RUN bun install --frozen-lockfile || bun install

# Generate Prisma client for Linux
RUN bunx prisma generate

# Copy source
COPY . .

# Build Next.js (standalone) + copy static/public
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Build WebSocket mini-service
RUN bun build mini-services/sorteo-ws/index.ts \
    --outfile /app/mini-services-dist/mini-service-sorteo-ws.js \
    --target bun

# Persistent directory for SQLite
RUN mkdir -p /app/db

# Startup entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

VOLUME ["/app/db"]

EXPOSE 81

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -fs http://localhost:81/ > /dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
