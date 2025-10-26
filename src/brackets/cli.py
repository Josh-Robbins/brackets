import argparse, importlib, importlib.util, importlib.machinery, pathlib, sys, subprocess

def _load(target: str):
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
    from importlib.resources import files as pkg_files
    src = pathlib.Path(str(pkg_files('brackets').joinpath('static/vendor/htmx.min.js')))
    if not src.exists():
        print("No package vendor found. Run: brx assets fetch --dest package"); return 1
    dst = pathlib.Path.cwd() / "public" / "vendor" / "htmx.min.js"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(src.read_bytes())
    print(f"Copied {src} → {dst}")
    return 0

def _cache_status():
    try:
        from brackets.internal import cache as _c
    except Exception as e:
        print("Cannot import cache backend:", e); return 1
    mode = _c._backend.get("mode") if hasattr(_c, "_backend") else "unknown"
    print("Cache backend:", mode)
    if mode == "memory":
        size = len(_c._mem_store) if hasattr(_c, "_mem_store") else "n/a"
        print("Memory items:", size)
    elif mode == "redis":
        print("Redis client:", "ok" if _c._backend.get("client") else "n/a")
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
        print("mkdocs not found. Install: pip install mkdocs mkdocstrings mkdocs-material")
        return 1
    return 0

def _docs_new(slug: str, title: str | None):
    slug = slug.strip().lower().replace(' ', '-')
    md = pathlib.Path("docs") / f"{slug}.md"
    md.parent.mkdir(parents=True, exist_ok=True)
    t = title or slug.replace('-', ' ').title()
    md.write_text(f"# {t}\n\n(coming soon)\n", encoding="utf-8")
    print(f"Created {md}. Add it to mkdocs.yml under 'nav:' to show in the sidebar.")
    return 0

_BXC_TEMPLATE = """<!-- components/{Name}.bxc -->
<script lang="python">
from brackets import Component
class {Name}(Component):
    async def mount(self, props, state):
        n, _ = self.useState('n', 0); return {{ 'n': n }}
    async def increment(self):
        n, setN = self.useState('n', 0); setN(n+1)
</script>
<section>
  <button onClick={{increment}}>+1</button>
  <strong>{{n}}</strong>
</section>
"""

_SPLIT_PY = """# components/{Name}.py
from brackets import Component
class {Name}(Component):
    view = 'components/{Name}.bx'
    async def mount(self, props, state):
        n, _ = self.useState('n', 0); return {{ 'n': n }}
    async def increment(self):
        n, setN = self.useState('n', 0); setN(n+1)
"""

_SPLIT_BX = """<!-- components/{Name}.bx -->
<section>
  <button onClick={{increment}}>+1</button>
  <strong>{{n}}</strong>
</section>
"""

def _new_component(name: str, style: str):
    name = ''.join(ch for ch in name if ch.isalnum())
    if not name:
        print("Invalid component name."); return 1
    comp_dir = pathlib.Path("components")
    comp_dir.mkdir(exist_ok=True)
    if style == "bxc":
        path = comp_dir / f"{name}.bxc"
        path.write_text(_BXC_TEMPLATE.replace("{Name}", name), encoding="utf-8")
        print("Created", path)
    elif style == "split":
        (comp_dir / f"{name}.py").write_text(_SPLIT_PY.replace("{Name}", name), encoding="utf-8")
        (comp_dir / f"{name}.bx").write_text(_SPLIT_BX.replace("{Name}", name), encoding="utf-8")
        print(f"Created components/{name}.py and components/{name}.bx")
    else:
        path = comp_dir / f"{name}.py"
        inline_py = _SPLIT_PY.replace("view = 'components/{Name}.bx'", "from brackets import bx\n    view = bx.lines('<section>', '<button onClick={{increment}}>+1</button>', '<strong>{{n}}</strong>', '</section>')").replace("{Name}", name)
        path.write_text(inline_py, encoding="utf-8")
        print("Created", path)
    return 0

def _new_page(path: str):
    p = pathlib.Path("app/templates/pages") / path
    p.parent.mkdir(parents=True, exist_ok=True)
    content = "<h1>{title or 'New Page'}</h1>\n"
    p.write_text(content, encoding="utf-8")
    print("Created page", p)
    return 0

def _desktop(target: str, title: str, width: int, height: int):
    app = _load(target)
    from .internal.app import openWindow
    openWindow(app, title=title, width=width, height=height)

def main():
    p = argparse.ArgumentParser('brx')
    sub = p.add_subparsers(dest='cmd', required=True)

    dev = sub.add_parser('dev'); dev.add_argument('target'); dev.add_argument('--host', default='127.0.0.1'); dev.add_argument('--port', type=int, default=8000)
    srv = sub.add_parser('serve'); srv.add_argument('target'); srv.add_argument('--host', default='0.0.0.0'); srv.add_argument('--port', type=int, default=8000)

    assets = sub.add_parser('assets', help='Assets operations')
    assets_sub = assets.add_subparsers(dest='op', required=True)
    a_fetch = assets_sub.add_parser('fetch'); a_fetch.add_argument('--version', default='1.9.12'); a_fetch.add_argument('--dest', choices=['package','project'], default='project')
    assets_sub.add_parser('vendor')

    cache = sub.add_parser('cache', help='Cache helpers')
    cache_sub = cache.add_subparsers(dest='op', required=True)
    cache_sub.add_parser('status')

    docs = sub.add_parser('docs', help='Docs site')
    docs_sub = docs.add_subparsers(dest='op', required=True)
    docs_sub.add_parser('serve')
    docs_sub.add_parser('build')
    newdoc = docs_sub.add_parser('new'); newdoc.add_argument('slug'); newdoc.add_argument('--title')

    new = sub.add_parser('new', help='Scaffold things')
    new_sub = new.add_subparsers(dest='what', required=True)
    comp = new_sub.add_parser('component'); comp.add_argument('name'); comp.add_argument('--style', choices=['bxc','split','inline'], default='bxc')
    page = new_sub.add_parser('page'); page.add_argument('path', help='e.g. users/[id].bx')

    desk = sub.add_parser('desktop'); desk.add_argument('target'); desk.add_argument('--title', default='Brackets App'); desk.add_argument('--width', type=int, default=1200); desk.add_argument('--height', type=int, default=800)

    a = p.parse_args()
    if a.cmd == 'dev': _serve(a.target, mode='dev', host=a.host, port=a.port)
    elif a.cmd == 'serve': _serve(a.target, mode='prod', host=a.host, port=a.port)
    elif a.cmd == 'assets':
        if a.op == 'fetch': sys.exit(_assets_fetch(a.version, a.dest))
        elif a.op == 'vendor': sys.exit(_assets_vendor())
    elif a.cmd == 'cache':
        if a.op == 'status': sys.exit(_cache_status())
    elif a.cmd == 'docs':
        if a.op == 'serve': sys.exit(_docs_serve())
        elif a.op == 'build': sys.exit(_docs_build())
        elif a.op == 'new': sys.exit(_docs_new(a.slug, a.title))
    elif a.cmd == 'new':
        if a.what == 'component': sys.exit(_new_component(a.name, a.style))
        elif a.what == 'page': sys.exit(_new_page(a.path))
    elif a.cmd == 'desktop':
        _desktop(a.target, a.title, a.width, a.height)

if __name__ == '__main__':
    sys.exit(main())