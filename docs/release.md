# Brackets Release

Brackets should be distributed as a drop-in framework, not as a package-manager-first framework.

The goal is simple:

- drop Brackets into a folder
- start building
- copy that folder to a desktop location or server
- keep the app working without introducing a build step

## Core Rule

Brackets should not require:

- npm install
- a bundler
- a compiler
- a scaffold command
- a framework-specific project bootstrap

The public experience should be file-first.

## Official Distribution Shape

The professional Brackets release shape is:

```text
Brackets/
  framework/
    datastar.js
    runtime.js
    syntax.js
    agents.md
    demo/
      index.html
      service-worker.js
      app/
        styles.css
        logo.svg
        favicon.svg
        storage/
    example/
  app/
  tests/
    test.js
  cli.js
  config.yaml
  index.html
  robots.txt
  README.md
```

That folder is the product.

## Distribution Channel

The default professional distribution channel should be a versioned portable `.zip`.

That gives Brackets the simplest possible path for normal users:

1. Download the official Brackets zip.
2. Unzip it wherever you want to work.
3. Open the folder and start building.
4. Copy that same folder to a server or host when you are ready to ship.

This is a better primary path than making users install a package manager dependency, run a scaffold command, or adopt a build pipeline before they can start.

Recommended release channels:

- primary: versioned GitHub release zip
- secondary: source repository for contributors
- optional: bundled local host binary alongside the portable folder for users who want same-origin local hosting without installing anything

The important thing is that the default Brackets experience stays download-first and file-first.

## CI and packaged `release/`

When this repository contains a `release/` tree, GitHub Actions should treat **`release/SHA256SUMS`** as required and verify it with `sha256sum -c` so packaged artifacts cannot drift silently. Source remains authoritative, but packaged release integrity is part of the gate now, alongside **`deno test`**, the contracts smoke job, and the well-known host/app contract checks.

## Supported Runtime Modes

**Production-supported today (CI-gated, same contract):** the **built-in same-origin Brackets host** plus ordinary **web deployment** of the same folder behind HTTPS. The three shapes below describe how apps are *organized*; native shells (Tauri, WebView2, and similar) are integration targets, not a shipped parity matrix—plan adapter work separately.

Brackets should officially support three distribution modes with the same app contract:

### 1. Desktop-folder mode

Use when:

- the app lives in a folder on a local machine
- the user wants to start building immediately
- the app uses local `.data` files such as `.json`, `.yaml`, or `.db`

Current expectation:

- Brackets can be opened through the tiny same-origin host
- no package manager setup is required
- the app still uses plain Brackets files

### 2. File-server mode

Use when:

- the app is static or file-backed
- the deployment target can serve a folder directly
- the app should work by copying files to the server and pointing a domain at it

Current expectation:

- the exported folder is self-contained
- the framework, app, config, tests, and root files are already present
- no frontend build step is required before deployment

### 3. Paired-backend mode

Use when:

- the app talks to an installed backend
- remote auth, APIs, SSE, or larger backend systems are needed

Current expectation:

- the frontend folder stays the same
- `.api` points to the paired backend
- the backend is optional architecture, not a requirement for Brackets itself

## Dev Experience

The intended dev experience is:

1. Copy or create a Brackets app folder.
2. Edit `.view`, `.html`, `.logic`, `.api`, `.data`, and storage files directly.
3. Run the optional local host only when same-origin serving or local file-backed behavior is needed.
4. Run `status server`, `health`, and `run app test` as the built-in verification path.
5. Run `deno test tests/test.js --allow-all` (or `run app test`) for the full host-level demo gate—no npm or Playwright.
6. Assemble the portable folder directly when desired.

The important part is that Brackets remains usable as files first.

## Production Experience

The intended production experience is:

1. Finish the app in the same file model used during development.
2. Assemble the portable folder.
3. Copy the folder to the deployment target.
4. Serve it as a site, file-backed app, or paired-backend app.

Brackets should feel closer to shipping a well-structured site/app folder than shipping a compiled framework build.

For Docker-based local and production deployment patterns, read:

- [docker.md](./docker.md)

## Professional Release Standard

To feel production-ready, a Brackets release should include:

- the portable `framework` runtime files
- the `framework` folder
- the `framework/demo` starter assets
- the `app` folder
- the root `config.yaml` contract
- the starter `tests/test.js`
- docs that explain desktop-folder, file-server, and paired-backend use clearly

## Why This Matters

This is one of Brackets' strongest advantages over heavier frameworks:

- less setup
- less ceremony
- less toolchain lock-in
- easier local-first and file-backed workflows
- easier movement from development to production

Brackets should win by making the app itself portable.
