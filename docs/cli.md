# CLI

## Servers
- `brx dev app.mod:app` – dev server (reload with import string)
- `brx serve app.mod:app` – prod server

## Assets
- `brx assets fetch --version 1.9.12 --dest project|package` – download htmx
- `brx assets vendor` – copy vendored htmx from package into `./public/vendor`

## Cache
- `brx cache status` – show backend (memory or redis), basic stats

## Docs
- `brx docs serve` – run MkDocs locally
- `brx docs build` – build static site to `site/`
- `brx docs new getting-started --title "Getting Started"` – scaffold a new page

## Scaffolding
- `brx new component Counter --style bxc|split|inline` – creates a component
- `brx new page users/[id].bx` – adds a page under `app/templates/pages`