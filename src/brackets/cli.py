import argparse, importlib, os, sys, urllib.request, pathlib, shutil, textwrap
from pathlib import Path

def _load(target: str):
    mod, obj = target.split(':', 1)
    return getattr(importlib.import_module(mod), obj)

def main():
    p = argparse.ArgumentParser("brx")
    sub = p.add_subparsers(dest="cmd", required=True)

    dev = sub.add_parser("dev"); dev.add_argument("target")
    srv = sub.add_parser("serve"); srv.add_argument("target")
    desk = sub.add_parser("desktop"); desk.add_argument("target"); desk.add_argument("--title", default="Brackets App")
    pack = sub.add_parser("pack"); pack.add_argument("entry"); pack.add_argument("--name", required=True)
    cache = sub.add_parser("cache"); cache.add_argument("action", choices=["status","auto","use","clear"])
    cache.add_argument("--url"); cache.add_argument("--tags"); cache.add_argument("--key")
    assets = sub.add_parser("assets"); assets.add_argument("action", choices=["fetch"])
    new = sub.add_parser("new"); new.add_argument("kind", choices=["component","page"]); new.add_argument("name"); new.add_argument("--split", action="store_true"); new.add_argument("--inline", action="store_true")
    fmt = sub.add_parser("fmt"); fmt.add_argument("paths", nargs="*", default=["."])
    conv = sub.add_parser("convert"); conv.add_argument("what", choices=["component"]); conv.add_argument("path"); conv.add_argument("--to", choices=["bxc","split","inline"], required=True)

    a = p.parse_args()
    if a.cmd in ("dev","serve"):
        import uvicorn
        app = _load(a.target)
        uvicorn.run(app, reload=(a.cmd=="dev"))
    elif a.cmd=="desktop":
        from .internal.desktop import openWindow
        app = _load(a.target)
        openWindow(app, title=a.title)
    elif a.cmd=="pack":
        print("TODO: PyInstaller wrapper coming soon")
    elif a.cmd=="cache":
        from .internal.cache import useCache, invalidate
        if a.action=="status":
            print("Cache status: TODO (backend + stats)")
        elif a.action=="auto":
            useCache("auto"); print("cache set to auto (prefers Redis, falls back to memory)")
        elif a.action=="use":
            useCache(a.url or "auto"); print("cache backend set")
        elif a.action=="clear":
            invalidate(key=a.key, tags=(a.tags.split(",") if a.tags else None)); print("cache cleared")
    elif a.cmd=="assets":
        # download htmx
        vendor = Path(__file__).resolve().parent / "static" / "vendor"
        vendor.mkdir(parents=True, exist_ok=True)
        url = "https://unpkg.com/htmx.org@2.0.3/dist/htmx.min.js"
        dest = vendor / "htmx.min.js"
        print("Downloading", url, "->", dest)
        urllib.request.urlretrieve(url, dest); print("Done.")
    elif a.cmd=="new":
        base = Path("components" if a.kind=="component" else "templates/pages")
        base.mkdir(parents=True, exist_ok=True)
        if a.kind=="component":
            name = a.name if a.name.endswith(".bxc") else a.name + ".bxc"
            (base / name).write_text(textwrap.dedent("""            <script lang="python">
            from brackets import Component
            class {ClassName}(Component):
                async def mount(self, props, state):
                    n, _ = self.useState('n', 0); return { 'n': n }
                async def increment(self): n, setN = self.useState('n', 0); setN(n+1)
            </script>
            <template>
              <section><button onClick={increment}>+1</button><strong>{n}</strong></section>
            </template>
            """).replace("{ClassName}", Path(name).stem))
            print("Created", base / name)
        else:
            name = a.name if a.name.endswith(".bx") else a.name + ".bx"
            (base / name).write_text("<h1>{title}</h1>")
            print("Created", base / name)
    elif a.cmd=="fmt":
        # simple loop migration: [each x in y] -> [for y as x]
        pats = [(re.compile(r'\[each\s+([A-Za-z_]\w*)\s+in\s+([^\]]+)\]'), r'[for \2 as \1]')]
        for root in a.paths:
            for p in Path(root).rglob("*.*"):
                if p.suffix in (".bx",".bxc"):
                    s = p.read_text(encoding="utf-8")
                    import re
                    s2 = re.sub(r'\[each\s+([A-Za-z_]\w*)\s+in\s+([^\]]+)\]', r'[for \2 as \1]', s)
                    if s2 != s: p.write_text(s2, encoding="utf-8"); print("formatted", p)
    elif a.cmd=="convert":
        print("Converter not implemented yet.")
