# Brackets Docker

This document explains how to run Brackets with Docker for:

- local development
- paired backends
- file-backed local data
- production deployment

The main rule does not change:

- no build step
- no frontend bundling requirement
- keep the Brackets app as normal files

Docker should package or serve the Brackets folder, not force Brackets into a build pipeline.

## Core Docker model

Brackets works well with Docker because the framework is already file-first.

That means:

- the app folder can be mounted directly into a web server container for development
- the same folder can be copied into an image for production
- a backend can run beside it in another container
- writable local storage can be mounted separately

Good Docker uses for Brackets:

- local dev on a team that already uses Docker
- production deployments with a reverse proxy
- pairing Brackets with any backend stack
- isolating writable `.json`, `.yaml`, or `.db` storage

## Pick the right Docker shape

### Static or mostly static site

Use:

- one web server container
- the Brackets folder mounted or copied into it

### Backend-connected app

Use:

- one web server or reverse proxy container for Brackets
- one backend container
- one shared Docker network

### File-backed local data

Use:

- one web or host container
- a separate writable mount for `app/` data files or `storage/`

### Production app

Use:

- a reverse proxy or web server container
- a backend container when needed
- named volumes or dedicated bind mounts for writable data
- TLS at the edge

## Local Docker dev

For local dev, use bind mounts so your file edits are visible immediately.

Docker’s bind-mount docs and Compose networking docs are the main references here:

- [Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- [Compose networking](https://docs.docker.com/compose/how-tos/networking/)

### Example local `compose.yaml`

```yaml
services:
  web:
    image: caddy:2-alpine
    ports:
      - "8080:80"
    volumes:
      - ./:/srv:ro
      - ./ops/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  caddy-data:
  caddy-config:
```

### Example local `ops/Caddyfile`

```text
:80 {
  root * /srv
  try_files {path} /index.html
  file_server
}
```

This is a strong default for:

- simple websites
- SPAs using the Brackets router
- apps that do not need a writable local `.data` path inside the container

## Local Docker with writable `.data`

If the app uses `.json`, `.yaml`, or `.db`, do not make the whole app folder writable unless you truly need that.

Prefer:

- app files mounted read-only
- storage mounted separately as writable

### Example writable storage mount

```yaml
services:
  web:
    image: caddy:2-alpine
    ports:
      - "8080:80"
    volumes:
      - ./:/srv:ro
      - ./app/storage:/srv/app/storage
      - ./ops/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  caddy-data:
  caddy-config:
```

Use this pattern for:

- `.json` content stores
- `.yaml` settings/content stores
- `.db` SQLite files

If the framework host needs a specific writable path, keep that path isolated and explicit.

## Docker with a paired backend

Brackets stays backend agnostic in Docker too.

The best pattern is usually:

- serve Brackets from one web container
- reverse proxy backend requests through the same origin
- keep `.api` pointed at same-origin paths such as `/api` or `/remote`

That avoids unnecessary CORS complexity.

OWASP’s HTML5 security guidance warns against treating permissive cross-origin setups as harmless defaults:

- [HTML5 Security Cheat Sheet: CORS](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)

### Example paired-backend `compose.yaml`

```yaml
services:
  web:
    image: caddy:2-alpine
    ports:
      - "8080:80"
    volumes:
      - ./:/srv:ro
      - ./ops/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - backend

  backend:
    image: your-backend-image:latest
    expose:
      - "8080"
    environment:
      APP_ENV: development

volumes:
  caddy-data:
  caddy-config:
```

### Example paired-backend `ops/Caddyfile`

```text
:80 {
  root * /srv
  try_files {path} /index.html
  file_server

  handle_path /api/* {
    reverse_proxy backend:8080
  }

  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
```

That lets Brackets `.api` modules use paths like:

- `/api/users`
- `/api/posts`
- `/api/auth/session`

without hard-coding container names or external origins into app code.

## Docker with SSE backends

Brackets and Datastar work well with SSE when the proxy preserves streaming behavior.

Rules:

- do not buffer SSE responses
- keep the connection same-origin when possible
- make sure the reverse proxy passes through `text/event-stream`

In app code, prefer:

- `read('/api/stream')`
- or `.api` methods that wrap the same same-origin path

Keep the SSE endpoint in the backend container and proxy it through the front container when you want one clean origin.

## Production Docker shape

For production, Docker’s Compose production guidance is worth following:

- [Use Compose in production](https://docs.docker.com/compose/how-tos/production/)
- [Volumes](https://docs.docker.com/engine/storage/volumes/)

The main production pattern should be:

1. app files are part of the release artifact
2. writable storage is mounted separately
3. backend runs in its own container when needed
4. reverse proxy serves the Brackets folder and proxies backend paths
5. TLS terminates at the edge

### Production principles

- keep app code immutable
- keep writable storage outside the immutable app layer
- keep same-origin paths for frontend-to-backend requests
- keep security headers enabled
- keep CSRF protection on state-changing backend routes
- keep secrets in environment or platform secret stores, not in Brackets files

### Example production `compose.yaml`

```yaml
services:
  web:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./release:/srv:ro
      - ./ops/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - backend

  backend:
    image: your-backend-image:stable
    restart: unless-stopped
    expose:
      - "8080"
    environment:
      APP_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      SESSION_SECRET: ${SESSION_SECRET}
    volumes:
      - backend-data:/var/lib/app

volumes:
  caddy-data:
  caddy-config:
  backend-data:
```

### Production reverse proxy example

```text
example.com {
  root * /srv
  try_files {path} /index.html
  file_server

  handle_path /api/* {
    reverse_proxy backend:8080
  }

  header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
```

This production shape works well for:

- websites
- SPAs
- backend-connected apps
- apps with local writable storage

## Production security guidance

Use these rules in Docker deployments:

- serve Brackets and the backend through one origin when possible
- protect state-changing routes with CSRF defenses
- set strong response headers
- keep writable mounts minimal
- keep secrets out of the app folder
- do not make storage world-writable
- terminate TLS before public traffic reaches the app

Security references:

- [OWASP HTTP Security Response Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)

## Connecting any backend

Brackets should not care whether the backend is:

- C#
- Rust
- Go
- Python
- PHP
- Ruby
- Java
- Node
- .NET
- a custom service behind a reverse proxy

The clean rule is:

- Brackets frontend stays the same
- `.api` stays the transport contract
- Docker wiring decides where `/api` or `/remote` goes

That means you can keep Brackets portable and swap backend stacks without rewriting the frontend architecture.

## Recommended production release flow

1. Finish the Brackets app as plain files.
2. Validate the app.
3. Export or assemble the release folder.
4. Mount or copy that release folder into the web container.
5. Mount writable storage separately if needed.
6. Put the backend on the same Docker network.
7. Proxy backend traffic through the same public origin.
8. Add TLS, security headers, secrets, and backups.

## When Docker is not the best choice

Do not force Docker if a simpler path is better.

Examples:

- a plain static host may be enough for a website
- a simple server folder deploy may be enough for a file-backed app
- a platform-native host may be better for desktop packaging

Docker is a good option, not a requirement.
