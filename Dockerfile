# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build the SDK
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy built files and package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Set production environment
ENV NODE_ENV=production

# Development stage
FROM node:20-alpine AS development

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies including devDependencies
RUN npm ci

# Copy configuration files
COPY tsconfig.json jest.config.js .eslintrc.json .prettierrc ./

# Copy source and test files
COPY src ./src
COPY tests ./tests

# Expose port for development server if needed
EXPOSE 3000

# Default command for development
CMD ["npm", "run", "dev"]
