# ==============================================================================
# Stage 1: Build native dependencies (better-sqlite3 native bindings)
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install minimal compilation tools required for native C++ addons
RUN apk add --no-cache python3 make g++

# Copy package manifests first for optimal layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# ==============================================================================
# Stage 2: Hardened, zero-vulnerability minimal production runtime
# ==============================================================================
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck and apply all upstream security patches
RUN apk add --no-cache curl && apk upgrade --no-cache

# Copy pre-built dependencies from builder stage (no compiler tools in production image)
COPY --from=builder /app/node_modules ./node_modules

# Copy application source files
COPY --chown=node:node . .

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Run as non-root user for security compliance
USER node

# Expose web server port
EXPOSE 3000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start production application
CMD ["node", "server.js"]
