# GLWM SDK Build Automation
# ===========================

.PHONY: all install build test lint type-check clean dist docker help

# Default target
all: install lint type-check test build

# Install dependencies
install:
	@echo "Installing dependencies..."
	npm ci

# Install dependencies (development)
install-dev:
	@echo "Installing dependencies (including devDependencies)..."
	npm install

# Build the SDK
build:
	@echo "Building SDK..."
	npm run build

# Run all tests
test:
	@echo "Running tests..."
	npm test

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	npm run test:coverage

# Run tests in watch mode
test-watch:
	@echo "Running tests in watch mode..."
	npm run test:watch

# Run unit tests only
test-unit:
	@echo "Running unit tests..."
	npm test -- --testPathPattern="tests/unit"

# Run integration tests only
test-integration:
	@echo "Running integration tests..."
	npm test -- --testPathPattern="tests/integration"

# Run acceptance tests only
test-acceptance:
	@echo "Running acceptance tests..."
	npm test -- --testPathPattern="tests/acceptance"

# Run linting
lint:
	@echo "Running linter..."
	npm run lint

# Fix linting issues
lint-fix:
	@echo "Fixing linting issues..."
	npm run lint:fix

# Run type checking
type-check:
	@echo "Running TypeScript type check..."
	npm run typecheck

# Format code
format:
	@echo "Formatting code..."
	npm run format

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist/
	rm -rf coverage/
	rm -rf node_modules/.cache/

# Deep clean (including node_modules)
clean-all: clean
	@echo "Deep cleaning..."
	rm -rf node_modules/
	rm -f package-lock.json

# Create distribution package
dist: clean build
	@echo "Creating distribution package..."
	mkdir -p dist/package
	cp -r dist/*.js dist/*.d.ts dist/package/ 2>/dev/null || true
	cp package.json README.md LICENSE dist/package/ 2>/dev/null || true
	cd dist/package && npm pack
	@echo "Distribution package created in dist/package/"

# Docker build
docker:
	@echo "Building Docker image..."
	docker build -t glwm-sdk:latest .

# Docker development environment
docker-dev:
	@echo "Starting Docker development environment..."
	docker-compose up -d

# Docker stop
docker-stop:
	@echo "Stopping Docker containers..."
	docker-compose down

# Run security audit
audit:
	@echo "Running security audit..."
	npm audit

# Run security audit and fix
audit-fix:
	@echo "Running security audit with fixes..."
	npm audit fix

# Validate all (CI-like check)
validate: install lint type-check test
	@echo "All validations passed!"

# Pre-commit checks
pre-commit: lint type-check test-unit
	@echo "Pre-commit checks passed!"

# Release preparation
prepare-release: validate build
	@echo "Release preparation complete!"

# Show version
version:
	@node -p "require('./package.json').version"

# Help
help:
	@echo "GLWM SDK Build Commands"
	@echo "======================="
	@echo ""
	@echo "Development:"
	@echo "  make install      - Install dependencies"
	@echo "  make install-dev  - Install with devDependencies"
	@echo "  make build        - Build the SDK"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make clean-all    - Deep clean (including node_modules)"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-coverage  - Run tests with coverage"
	@echo "  make test-watch     - Run tests in watch mode"
	@echo "  make test-unit      - Run unit tests only"
	@echo "  make test-integration - Run integration tests"
	@echo "  make test-acceptance  - Run acceptance tests"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint         - Run linter"
	@echo "  make lint-fix     - Fix linting issues"
	@echo "  make type-check   - Run TypeScript type check"
	@echo "  make format       - Format code with Prettier"
	@echo ""
	@echo "Security:"
	@echo "  make audit        - Run security audit"
	@echo "  make audit-fix    - Run security audit with fixes"
	@echo ""
	@echo "Docker:"
	@echo "  make docker       - Build Docker image"
	@echo "  make docker-dev   - Start development environment"
	@echo "  make docker-stop  - Stop Docker containers"
	@echo ""
	@echo "Release:"
	@echo "  make dist            - Create distribution package"
	@echo "  make validate        - Run all validations"
	@echo "  make pre-commit      - Run pre-commit checks"
	@echo "  make prepare-release - Prepare for release"
	@echo "  make version         - Show current version"
	@echo ""
	@echo "  make all          - Install, lint, type-check, test, build"
	@echo "  make help         - Show this help message"
