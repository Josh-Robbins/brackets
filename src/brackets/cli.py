import argparse, importlib, importlib.util, importlib.machinery, pathlib, sys, subprocess

def _load(target: str):
    """Load ASGI app from either import string (pkg.mod:obj) or file path (path.py:obj)."""
    target = target.strip().strip('"').strip("'")
    if target.lower().endswith(".py") or target.replace("\\","/").lower().endswith(".py:app"):
        path_s, obj = target.split(":", 1)
        path = pathlib.Path(path_s).resolve()
        sys.path.insert(0, str(path.parent))
        name = path.stem
        spec = importlib.util.spec_from_loader(
            name, importlib.machinery.SourceFileLoader(name, str(path))
        )
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Cannot load module from {path}")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[attr-defined]
        return getattr(mod, obj)
    mod, obj = target.split(":", 1)
    return getattr(importlib.import_module(mod), obj)

def _serve(target: str, mode: str = 'dev', host: str = '127.0.0.1', port: int = 8000):
    import uvicorn
    is_import = ':' in target and not target.replace("\\","/").lower().endswith('.py:app')
    if mode == 'dev':
        if is_import:
            uvicorn.run(target, host=host, port=port, reload=True, factory=False)
        else:
            app = _load(target)
            print("WARNING: Running without auto-reload because target is a file path.")
            print("Tip: add __init__.py and use 'pkg.mod:app' for reload.")
            uvicorn.run(app, host=host, port=port, reload=False)
    else:
        if is_import: uvicorn.run(target, host=host, port=port, workers=1)
        else: uvicorn.run(_load(target), host=host, port=port)

def _assets_fetch(version: str, dest: str):
    """Fetch htmx and place it under package or project vendor dirs."""
    try:
        import httpx  # type: ignore
    except Exception:
        print("httpx not installed. Try: pip install httpx"); return 1
    url = f"https://unpkg.com/htmx.org@{version}/dist/htmx.min.js"
    r = httpx.get(url, timeout=20)
    r.raise_for_status()
    data = r.content
    if dest == 'package':
        from importlib.resources import files as pkg_files
        target = pkg_files('brackets').joinpath('static/vendor/htmx.min.js')
        p = pathlib.Path(str(target))
    else:
        p = pathlib.Path.cwd() / "public" / "vendor" / "htmx.min.js"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    print(f"Downloaded htmx {version} → {p}")
    return 0

def _assets_vendor():
    """Copy the package's vendored htmx to ./public/vendor for apps."""
    from importlib.resources import files as pkg_files
    src = pathlib.Path(str(pkg_files('brackets').joinpath('static/vendor/htmx.min.js')))
    if not src.exists():
        print("No package vendor found. Run: brx assets fetch --dest package"); return 1
    dst = pathlib.Path.cwd() / "public" / "vendor" / "htmx.min.js"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(src.read_bytes())
    print(f"Copied {src} → {dst}")
    return 0

def _docs_serve():
    try:
        subprocess.run(["mkdocs","serve"], check=True)
    except FileNotFoundError:
        print("mkdocs not found. Install: pip install mkdocs mkdocs-material mkdocstrings")
        return 1
    return 0

def _docs_build():
    try:
        subprocess.run(["mkdocs","build"], check=True)
    except FileNotFoundError:
        print("mkdocs not found. Install: pip install mkdocs mkdocs-material mkdocstrings")
        return 1
    return 0

def main():
    p = argparse.ArgumentParser('brx')
    sub = p.add_subparsers(dest='cmd', required=True)

    dev = sub.add_parser('dev'); dev.add_argument('target'); dev.add_argument('--host', default='127.0.0.1'); dev.add_argument('--port', type=int, default=8000)
    srv = sub.add_parser('serve'); srv.add_argument('target'); srv.add_argument('--host', default='0.0.0.0'); srv.add_argument('--port', type=int, default=8000)

    assets = sub.add_parser('assets', help='Assets operations')
    assets_sub = assets.add_subparsers(dest='op', required=True)
    a_fetch = assets_sub.add_parser('fetch'); a_fetch.add_argument('--version', default='1.9.12'); a_fetch.add_argument('--dest', choices=['package','project'], default='project')
    assets_sub.add_parser('vendor')

    docs = sub.add_parser('docs', help='Docs site')
    docs_sub = docs.add_subparsers(dest='op', required=True)
    docs_sub.add_parser('serve')
    docs_sub.add_parser('build')

    desk = sub.add_parser('desktop'); desk.add_argument('target'); desk.add_argument('--title', default='Brackets App'); desk.add_argument('--width', type=int, default=1200); desk.add_argument('--height', type=int, default=800)

    a = p.parse_args()
    if a.cmd == 'dev':
        _serve(a.target, mode='dev', host=a.host, port=a.port)
    elif a.cmd == 'serve':
        _serve(a.target, mode='prod', host=a.host, port=a.port)
    elif a.cmd == 'assets':
        if a.op == 'fetch': sys.exit(_assets_fetch(a.version, a.dest))
        elif a.op == 'vendor': sys.exit(_assets_vendor())
    elif a.cmd == 'docs':
        if a.op == 'serve': sys.exit(_docs_serve())
        elif a.op == 'build': sys.exit(_docs_build())
    elif a.cmd == 'desktop':
        app = _load(a.target)
        from .internal.app import openWindow
        openWindow(app, title=a.title, width=a.width, height=a.height)

if __name__ == '__main__':
    sys.exit(main())
