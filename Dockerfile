# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and config files
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy drizzle config and migrations (needed for db:migrate at runtime)
COPY drizzle.config.ts ./
COPY src/db/migrations ./src/db/migrations

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 3000

# Run database migrations then start the server
CMD ["sh", "-c", "./node_modules/.bin/drizzle-kit migrate && node dist/server.js"]
