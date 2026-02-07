# REFOCUS PLAN

Four phases. Each phase is a shippable checkpoint — the SDK is in a better state after
every phase completes, and no phase depends on a later one.

---

## Phase 1 — Surgical Removal (Cut Dead Weight)

**Goal:** Remove everything that isn't called, isn't finished, or misleads consumers.
The SDK should contain only code that runs.

**Estimated scope:** ~1,500 lines deleted, 0 lines added.

### 1A. Delete orphaned utilities

These three modules are fully built but imported by zero core modules. They are
exported in `src/index.ts` but the SDK itself never calls them.

| File | Lines | Why it goes |
|------|-------|-------------|
| `src/utils/Metrics.ts` | 369 | Not called anywhere in SDK. Pre-built telemetry with counters, gauges, histograms, auto-flush — none wired in. |
| `src/utils/ErrorReporter.ts` | 399 | Not called anywhere in SDK. Hand-rolled Sentry client with breadcrumbs, sampling, stack parsing — none wired in. |
| `src/utils/Config.ts` | 355 | Not called anywhere in SDK. `GLWM` takes config via constructor; `ConfigManager` is a parallel path that nothing uses. |

**Actions:**
- Delete `src/utils/Metrics.ts`
- Delete `src/utils/ErrorReporter.ts`
- Delete `src/utils/Config.ts`
- Remove their exports from `src/utils/index.ts` and `src/index.ts`
- Delete corresponding tests: `tests/unit/Metrics.test.ts` (403 lines), `tests/unit/ErrorReporter.test.ts` (237 lines), `tests/unit/Config.test.ts` (248 lines)
- Remove `ErrorReporter` and `Metrics` imports from any barrel files
- Update `src/utils/Logger.ts` if it type-imports from deleted files (it doesn't — safe)

### 1B. Remove stub methods from public API

Four methods exist in the public API that throw on every call. They signal features
that don't exist and mislead consumers reading the API surface.

| Method | File | Line | What it does |
|--------|------|------|-------------|
| `getMintConfig()` | `src/GLWM.ts` | 452–459 | Throws `CONTRACT_ERROR` |
| `mint()` | `src/GLWM.ts` | 471–479 | Throws `CONTRACT_ERROR` |
| `fetchMintConfig()` | `src/minting/MintingPortal.ts` | 372–383 | Throws `Error` |
| `executeMint()` | `src/minting/MintingPortal.ts` | 388–400 | Throws `Error` |

**Actions:**
- Delete `getMintConfig()` and `mint()` from `GLWM.ts`
- Delete `fetchMintConfig()` and `executeMint()` from `MintingPortal.ts`
- Remove exports of `fetchMintConfig` and `executeMint` from `src/minting/index.ts` and `src/index.ts`
- Remove `MintConfig` and `MintRequest` from the `GLWM.ts` import list (still keep types in `types/index.ts` for future use)

### 1C. Remove phantom `webview` mode

`MintingPortal.openWebview()` at line 276 just calls `this.openIframe()`. It's not a
distinct implementation — it's an alias that promises native WebView support but
delivers iframe.

**Actions:**
- Remove `'webview'` from `MintingPortalConfig.mode` type union in `types/index.ts` (keep `'iframe' | 'redirect'`)
- Delete the `case 'webview':` branch and `openWebview()` method from `MintingPortal.ts`
- Update docs, README references, and acceptance tests that reference `webview` mode

### 1D. Remove `walletconnect` from provider type until implemented

`WalletConnector.ts` hardcodes `walletconnect` to return `false` at lines 121-123.
`getAvailableProviders()` explicitly excludes it at line 140. It's a type-level
promise with zero implementation.

**Actions:**
- Remove `'walletconnect'` from `WalletProvider` type union in `types/index.ts`
- Remove the `case 'walletconnect':` branch from `WalletConnector.isProviderAvailable()`
- Update any docs or acceptance tests referencing WalletConnect

### 1E. Remove infrastructure tooling that doesn't fit a browser SDK

| File | Why it goes |
|------|-------------|
| `Dockerfile` | This is a client-side SDK published to npm. Docker is for server deployments. |
| `docker-compose.yml` | Same reason. `npm test` and `npm run build` already work. |
| `Makefile` | 40+ commands duplicating what `package.json` scripts already do. |

**Actions:**
- Delete `Dockerfile`, `docker-compose.yml`, `Makefile`
- Delete `config/` directory (development.ts, staging.ts, production.ts, index.ts) — environment-specific server configs for a client SDK

### 1F. Verify nothing is broken

- Run `npm run typecheck` — must pass
- Run `npm test` — remaining tests must pass
- Run `npm run build` — must produce `dist/`

---

## Phase 2 — Test the Product (Mock the Blockchain)

**Goal:** The four core modules (`WalletConnector`, `LicenseVerifier`, `RPCProvider`,
`MintingPortal`) have zero tests today. This phase adds mocks for `ethers.js` and
writes tests that exercise the real product flows.

**Estimated scope:** ~800–1,200 lines of new test code.

### 2A. Create shared test fixtures and mocks

Build a `tests/mocks/` directory with reusable fakes:

**`tests/mocks/ethereum-provider.ts`** — Mock EIP-1193 provider:
- `request({ method: 'eth_requestAccounts' })` returns configurable addresses
- `request({ method: 'eth_chainId' })` returns configurable chain ID
- `request({ method: 'wallet_switchEthereumChain' })` succeeds or throws 4902
- `on()` / `removeListener()` for event subscription
- Simulates user rejection (error code 4001)
- Simulates pending request (error code -32002)

**`tests/mocks/rpc-provider.ts`** — Mock `RPCProvider`:
- `initialize()` succeeds
- `getProvider()` returns a mock `JsonRpcProvider`
- `call(fn)` executes `fn` with the mock provider
- `getBlockNumber()` returns a configurable block number
- Simulates RPC failures for retry testing

**`tests/mocks/license-contract.ts`** — Mock ERC721 contract:
- `balanceOf(address)` returns configurable balance (0n, 1n, etc.)
- `tokenOfOwnerByIndex(address, index)` returns configurable token IDs
- `ownerOf(tokenId)` returns configurable owner
- `tokenURI(tokenId)` returns configurable metadata URI
- Configurable metadata JSON responses for `fetch()`

**`tests/mocks/window.ts`** — Mock browser globals:
- `window.ethereum` with MetaMask flags
- `window.phantom.ethereum` with Phantom flags
- `document.createElement()` for iframe/overlay creation
- `window.addEventListener('message', ...)` for postMessage testing

### 2B. Test `RPCProvider`

**File:** `tests/unit/RPCProvider.test.ts`

| Test | What it proves |
|------|---------------|
| Initialize with Alchemy URL for each supported chain | URL construction is correct |
| Initialize with Infura URL for each supported chain | URL construction is correct |
| Initialize with custom URL | Custom provider path works |
| Reject unsupported chain ID | Error for unknown chains |
| Reject missing API key for Alchemy/Infura | Config validation at init |
| `call()` succeeds on first attempt | Happy path |
| `call()` retries on failure with exponential backoff | Retry logic works |
| `call()` falls back to secondary provider after primary exhausted | Fallback chain works |
| `call()` throws after all retries and fallbacks exhausted | Terminal failure |
| `withTimeout()` rejects after configured timeout | Timeout enforcement |
| `getBlockNumber()` delegates through `call()` | Convenience method wiring |

### 2C. Test `WalletConnector`

**File:** `tests/unit/WalletConnector.test.ts`

| Test | What it proves |
|------|---------------|
| `connect()` with MetaMask — happy path | Requests accounts, reads chain, builds connection |
| `connect()` with Phantom — uses `window.phantom.ethereum` | Phantom provider path |
| `connect()` with Coinbase — detects `isCoinbaseWallet` | Coinbase provider path |
| User rejects connection (4001) | Throws WALLET_CONNECTION_REJECTED |
| Pending request (−32002) | Throws WALLET_CONNECTION_REJECTED with pending message |
| No provider installed | Throws WALLET_NOT_FOUND |
| Chain mismatch detected | Calls `onChainMismatch` callback |
| `switchChain()` succeeds | Sends `wallet_switchEthereumChain`, updates session |
| `switchChain()` chain not added (4902) | Throws CHAIN_MISMATCH |
| `disconnect()` clears session and removes event listeners | Cleanup verified |
| `accountsChanged` event updates session address | Live account switch handled |
| `chainChanged` event updates session chainId | Live chain switch handled |
| `disconnect` event triggers disconnect | Provider disconnect handled |
| `detectBestProvider()` priority order | MetaMask > Coinbase > Phantom > custom |
| `getSession()` returns copy (not reference) | State immutability |

### 2D. Test `LicenseVerifier`

**File:** `tests/unit/LicenseVerifier.test.ts`

| Test | What it proves |
|------|---------------|
| `verifyLicense()` — address owns 1 token, not expired | Returns `isValid: true` with license |
| `verifyLicense()` — address owns 0 tokens | Returns `isValid: false`, reason `no_license_found` |
| `verifyLicense()` — token is expired | Returns `isValid: false`, reason `license_expired` |
| `verifyLicense()` — contract is paused | Returns `isValid: false`, reason `contract_paused` |
| `verifyLicense()` — RPC call fails | Returns `isValid: false`, reason `verification_failed` |
| `getAllLicenses()` — address owns 3 tokens | Returns array of 3 `LicenseNFT` objects |
| `getAllLicenses()` — address owns 0 tokens | Returns empty array |
| `getLicenseById()` — fetches owner and metadata | Correct token details returned |
| `fetchMetadata()` — IPFS URI resolved correctly | `ipfs://` → `https://ipfs.io/ipfs/` |
| `fetchMetadata()` — Arweave URI resolved correctly | `ar://` → `https://arweave.net/` |
| `fetchMetadata()` — HTTP URI passed through | No transformation |
| `fetchMetadata()` — fetch fails, returns defaults | Graceful degradation |
| `parseAttributes()` — all attribute types parsed | version, edition, soulbound, expiresAt, tier, crossGameAccess |
| `parseAttributes()` — handles case variations | `minted_by` and `mintedBy` both work |
| Contract not initialized | Throws CONTRACT_ERROR |

### 2E. Test `MintingPortal`

**File:** `tests/unit/MintingPortal.test.ts`

| Test | What it proves |
|------|---------------|
| `open()` in iframe mode creates overlay + iframe | DOM manipulation correct |
| `open()` in iframe mode sets correct src URL with wallet param | URL construction |
| `close()` removes overlay and cleans up event listeners | No DOM leaks |
| Click overlay background closes portal | UX behavior |
| Click close button closes portal | UX behavior |
| `PORTAL_READY` message sends wallet info back | PostMessage handshake |
| `MINT_STARTED` message triggers `onMintStarted` callback | Event routing |
| `MINT_COMPLETED` message triggers `onMintCompleted` and auto-closes | Success flow |
| `MINT_FAILED` message triggers `onMintCompleted` with error | Failure flow |
| `PORTAL_CLOSED` message triggers close | Portal-initiated close |
| Messages from wrong origin are ignored | Origin validation security |
| `open()` in redirect mode sets `window.location.href` | Redirect flow |
| `open()` when already open is a no-op | Idempotency |
| `autoCloseOnMint: false` keeps portal open after mint | Config respected |

### 2F. Integration test for `verifyAndPlay()` flow

**File:** `tests/integration/verify-and-play.test.ts`

End-to-end orchestration with all mocks wired together:

| Test | Flow |
|------|------|
| Happy path — user has license | init → connect → verify → returns valid result |
| No license — user mints successfully | init → connect → verify (no license) → portal opens → mint completes → re-verify → returns valid |
| No license — user cancels minting | init → connect → verify (no license) → portal opens → portal closes → re-verify → returns invalid |
| Wallet not connected — auto-connects | init → verifyAndPlay auto-connects → verify → returns |
| Expired license triggers minting flow | init → connect → verify (expired) → portal opens |
| Minting already in progress — throws | Call verifyAndPlay while minting_in_progress → error |
| State transitions are emitted in correct order | Subscribe and assert state sequence |
| Cache hit skips RPC call | First verify hits RPC, second verify returns cached result |
| `verifyLicenseFresh()` bypasses cache | Clears cache entry, hits RPC again |

---

## Phase 3 — Documentation Reset

**Goal:** Replace the 97KB specification document with developer-friendly onboarding
materials. A developer should go from `npm install` to working integration in under
5 minutes.

### 3A. Replace README.md

The current README is a 97KB technical specification. Replace it with a focused
developer README (~3KB target):

**Structure:**
1. **One-liner** — what GLWM does
2. **Install** — `npm install @glwm/sdk`
3. **Quick start** — 15-line code example showing `verifyAndPlay()`
4. **Configuration** — table of `GLWMConfig` fields with types and descriptions
5. **API** — brief list of public methods with one-line descriptions
6. **Error handling** — error codes table
7. **Supported chains** — chain ID table
8. **License** — MIT

Everything else moves to `docs/` or gets deleted.

### 3B. Consolidate docs/

Current state: 8 docs files, many overlapping with README content.

**Keep (updated):**
- `docs/quickstart.md` — step-by-step integration guide with React example
- `docs/api.md` — full API reference (auto-generate from JSDoc if possible)

**Merge into quickstart or delete:**
- `docs/architecture.md` → condense to a "How it works" section in quickstart
- `docs/FAQ.md` → fold common questions into quickstart troubleshooting section
- `docs/troubleshooting.md` → merge with FAQ into single troubleshooting section in quickstart
- `docs/user-stories.md` → delete (marketing material, not developer docs)
- `docs/compliance.md` → delete (premature for v0.1, no legal requirements exist yet)
- `docs/code-audit.md` → delete (no audit has been performed)

### 3C. Trim community files

| File | Action |
|------|--------|
| `CONTRIBUTING.md` | Keep — standard for open source |
| `SECURITY.md` | Keep — standard for open source |
| `SUPPORT.md` | Delete — one contributor project, not needed |
| `CHANGELOG.md` | Keep — update with actual changes |
| `LICENSE.md` | Delete — redundant with `LICENSE` file |

---

## Phase 4 — Harden the Core

**Goal:** Make the remaining code production-ready. Fix edge cases, improve
resilience, and add the minimal observability that the SDK actually needs.

### 4A. Wire in lightweight logging to core modules

`Logger` is already used by `LicenseVerifier`. Extend to other core modules:

- `GLWM.ts` — log state transitions at DEBUG level, errors at ERROR level
- `WalletConnector.ts` — log connection attempts, chain mismatches at WARN
- `RPCProvider.ts` — log retry attempts at WARN, fallback switches at INFO
- `MintingPortal.ts` — log portal open/close at DEBUG

This is ~20 lines of additions across 4 files. No new infrastructure needed —
`Logger` already exists and works.

### 4B. Harden error paths

Current gaps found during code review:

| Issue | File | Fix |
|-------|------|-----|
| `handleError()` defaults all unknown errors to `NETWORK_ERROR` | `GLWM.ts:621` | Distinguish between network errors, contract errors, and user errors based on error message/type |
| `getAllLicenses()` makes N sequential RPC calls for N tokens | `LicenseVerifier.ts:156-164` | Add `Promise.all` with configurable concurrency to parallelize metadata fetches |
| `fetchMetadata()` has no timeout | `LicenseVerifier.ts:215` | Add `AbortController` with 10s timeout to `fetch()` call |
| `waitForPortalClose()` has no timeout | `GLWM.ts:634-648` | Add configurable timeout (default 10 minutes) to prevent indefinite hangs |
| No address validation before RPC calls | `LicenseVerifier.ts:47` | Validate address format before calling contract |

### 4C. Add a working example

Create `examples/basic/` with a minimal HTML + JS example:

```
examples/
└── basic/
    ├── index.html      (~50 lines — button, status display, script tag)
    ├── app.js          (~40 lines — GLWM init, verifyAndPlay, UI updates)
    └── README.md       (~20 lines — how to run with a local server)
```

This proves the SDK works end-to-end and serves as living documentation.
Use a testnet contract (Sepolia or Polygon Amoy) so developers can actually
run it.

### 4D. Add observability hooks (optional, if warranted)

If metrics/error-reporting are needed, add them as **integration points**, not
built-in systems:

```typescript
// In GLWMConfig (types/index.ts)
onMetric?: (name: string, value: number, tags?: Record<string, string>) => void;
```

This is one callback. The consumer wires it to their own Datadog/Sentry/whatever.
This replaces the 369-line Metrics class and 399-line ErrorReporter class with a
single config option. Build this only if there's actual demand.

---

## Phase Summary

| Phase | What changes | Lines removed | Lines added | Outcome |
|-------|-------------|---------------|-------------|---------|
| **1 — Cut** | Delete unused code, stubs, Docker, Makefile | ~2,500 | 0 | SDK contains only code that runs |
| **2 — Test** | Mock ethers.js, test all 4 core modules + integration | 0 | ~1,000 | Product flows are verified |
| **3 — Docs** | Replace 97KB README, consolidate docs | ~90KB of docs | ~5KB of docs | Developers can onboard in 5 min |
| **4 — Harden** | Logging, error paths, timeouts, example app | ~50 | ~300 | Production-ready core |

Each phase is independently valuable. Phase 1 is the highest priority because it
reduces the maintenance surface and clarifies what the SDK actually is. Phase 2 is
the highest impact because it proves the product works. Phases 3 and 4 can run in
parallel.
