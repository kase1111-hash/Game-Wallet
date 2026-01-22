# Contributing to GLWM SDK

Thank you for your interest in contributing to the Game License Wallet Module (GLWM) SDK! This document provides guidelines and information for contributors.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Game-Wallet.git
   cd Game-Wallet
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/kase1111-hash/Game-Wallet.git
   ```

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

### Installation

```bash
# Install dependencies
npm install

# Run tests to verify setup
npm test

# Build the project
npm run build
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build the SDK for production |
| `npm run dev` | Build with watch mode |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run typecheck` | Run TypeScript type checking |

## Making Changes

1. **Create a feature branch** from `main`:
   ```bash
   git checkout main
   git pull upstream main
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**, following our [code standards](#code-standards)

3. **Write or update tests** for your changes

4. **Run the full test suite**:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

5. **Commit your changes** following our [commit guidelines](#commit-guidelines)

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that don't affect code meaning (whitespace, formatting)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Changes to build process or auxiliary tools

### Examples

```
feat(wallet): add support for Phantom wallet provider

fix(license): correct verification timeout handling

docs(api): update method signatures in API reference

test(minting): add unit tests for mint transaction flow
```

## Pull Request Process

1. **Ensure your PR addresses a single concern** (one feature, one bug fix, etc.)

2. **Update documentation** if your changes affect the public API

3. **Fill out the PR template** completely

4. **Request a review** from maintainers

5. **Address review feedback** promptly

### PR Checklist

Before submitting, ensure:

- [ ] Code follows the project's style guidelines
- [ ] All tests pass locally
- [ ] New tests added for new functionality
- [ ] Documentation updated if needed
- [ ] Commit messages follow conventions
- [ ] No unrelated changes included

## Code Standards

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig.json)
- Prefer interfaces over types where applicable
- Use explicit return types for public functions
- Avoid `any` type; use `unknown` if type is truly unknown

### Style

- Follow the ESLint configuration in `.eslintrc.json`
- Use Prettier for formatting (configured in `.prettierrc`)
- Use meaningful variable and function names
- Keep functions focused and small

### File Organization

```
src/
├── index.ts          # Public exports
├── GLWM.ts           # Main SDK class
├── types/            # Type definitions
├── wallet/           # Wallet-related modules
├── license/          # License verification modules
├── minting/          # Minting-related modules
├── rpc/              # RPC provider abstraction
└── utils/            # Utility functions
```

## Testing Requirements

### Test Coverage

- All new features must include tests
- Bug fixes should include regression tests
- Aim for meaningful coverage, not just line coverage

### Test Types

- **Unit tests**: Test individual functions and classes
- **Integration tests**: Test component interactions
- **Acceptance tests**: Test user flows

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/cache.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should verify license"
```

## Documentation

### When to Update Docs

- Adding new public API methods
- Changing existing API behavior
- Adding new features
- Fixing documentation errors

### Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Project overview and quick start |
| `docs/api.md` | Complete API reference |
| `docs/quickstart.md` | Detailed getting started guide |
| `docs/architecture.md` | System design documentation |
| `docs/FAQ.md` | Frequently asked questions |
| `docs/troubleshooting.md` | Common issues and solutions |
| `CHANGELOG.md` | Version history |

## Questions?

- Check the [FAQ](docs/FAQ.md) for common questions
- Review existing [issues](https://github.com/kase1111-hash/Game-Wallet/issues)
- Open a new issue for bugs or feature requests
- See [SUPPORT.md](SUPPORT.md) for support channels

---

Thank you for contributing to GLWM SDK!
