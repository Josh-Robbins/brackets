<!-- Interacts with: docs/index.md, docs/checklist.md, docs/platform.md, README.md, .github/workflows/ci.yml, tests/test.js -->

# Production readiness (review and status)

This document is the durable, in-repo counterpart to production-readiness planning. It is updated when the release gate or CI contract changes.

## Verification first (do this before treating “gaps” as open)

1. Run the framework test suite with Deno (repository root):

   ```bash
   deno test tests/test.js --allow-read --allow-write --allow-net --allow-env
   ```

   On Windows, if `deno` is not on `PATH`, use the bundled engine under `framework/host/windows-x64/deno.exe` the same way.

2. Treat **`tests/test.js` passing** as the hard gate for the built-in host. There is **no** separate npm/Playwright browser package in this repo; interactive UI checks remain optional manual QA (see [checklist](./checklist.md)).

### State as of 2026-04-15

| Gate | Result |
|------|--------|
| `deno test tests/test.js` (permissions as above) | **21 passed, 0 failed** (includes demo RPC, CSP nonce + RPC, contracts, `/robots.txt`, CSRF/origin/size/module denial checks, missing CSRF header, static `:html` sanitizer contract) |
| Playwright / `npm:` browser tests | **Not used** (removed in favor of Deno-only HTTP tests) |

Re-run the table after any change to `framework/server.js`, `framework/syntax.js`, `framework/runtime.js`, or `tests/test.js`.

## What is already in good shape (evidence-based)

- **Route dependency tokens** (`@data/`, `@api/`, `@app/...`): canonicalization in `normalizeRouteDependencyToken` in [`framework/server.js`](../framework/server.js) aligns with `routeDeclaresModuleToken` / RPC allowlists.
- **Syntax compiler**: scope-aware event expression handling in [`framework/syntax.js`](../framework/syntax.js); extend only when a failing test proves a hole.
- **Optional `service-worker.js`**: commented template at [`framework/example/service-worker.js`](../framework/example/service-worker.js); copy to the entry root when needed (not shipped in `framework/demo/` by default).
- **Release checksums**: [`release/SHA256SUMS`](../release/SHA256SUMS) when present; CI job `release-artifacts` verifies with `sha256sum -c` **only when** `release/**` is non-empty (see below).
- **Contract smoke**: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) includes a job that loads `.well-known/brackets-host.json` and `brackets-app.json`.

## Framework edit policy vs this repo’s Cursor rule

The workspace may mark `framework/*` as **immutable for normal app work**. Production and security fixes still belong in **`app/`**, **`config.yaml`**, and templates **unless** the change is **maintainer-approved core maintenance** (host, syntax, runtime). This document does not override maintainer policy; it records that framework edits should be rare, reviewed, and paired with tests in `tests/test.js`.

## Observability (incremental, not greenfield)

The built-in host already:

- logs structured JSON for access decisions (`bracketsAccessLog` / `brackets.access` channel in [`framework/server.js`](../framework/server.js));
- attaches **`requestId`** to CSRF/denial paths and JSON error payloads.

Further work is **documentation and small gaps** (for example exposing `requestId` on responses consistently, or documenting log fields)—not a from-scratch observability project.

## Security work ordering

Regression tests in **`tests/test.js`** (CSRF mismatch, missing CSRF header, same-origin rejection, malformed JSON, oversized bodies, route module denial, static `:html` sanitizer contract) should stay **ahead** of large changes to HTML sanitization in [`framework/runtime.js`](../framework/runtime.js).

## CI and `release/` checksum nuance

- The **`release-artifacts`** workflow runs **only if** the tree has files under `release/` (`hashFiles('release/**') != ''`).
- Day-to-day PRs may have an empty `release/`; checksum verification is skipped.
- **Release tags** that ship zips must include the exact bytes under `release/` and a matching **`release/SHA256SUMS`** file; regenerate checksums when artifacts change.

## Related docs

- [Adapter contract (Tauri / WebView2)](./adapter-contract.md)
- [Platform](./platform.md), [Release](./release.md), [Checklist](./checklist.md)
- [Reference: deferred contract work](./reference.md#deferred-contract-work-post-v1)
