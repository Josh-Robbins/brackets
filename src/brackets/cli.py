from __future__ import annotations
import argparse, sys, os
from pathlib import Path
import importlib, importlib.util, importlib.machinery

try:
    import tomllib  # 3.11+
except Exception:
    tomllib = None

_CANDIDATE_FILES = ("app.py","server.py","main.py","application.py")
_CANDIDATE_OBJS  = ("app","api","application","asgi")

def _read_default_target(cwd: Path) -> str | None:
    p = cwd / "brx.toml"
    if not p.exists() or tomllib is None: return None
    try:
        data = tomllib.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            if "defaultTarget" in data: return str(data["defaultTarget"])
            brx = data.get("brx")
            if isinstance(brx, dict) and "defaultTarget" in brx:
                return str(brx["defaultTarget"])
    except Exception:
        pass
    return None

def _resolve_target(arg: str | None, cwd: Path) -> str:
    if not arg:
        arg = _read_default_target(cwd) or "app"
    if ":" in arg:
        return arg
    p = Path(arg)
    if p.suffix.lower() == ".py":
        return f"{arg}:app"
    if p.exists() and p.is_dir():
        for fname in _CANDIDATE_FILES:
            c = p / fname
            if c.exists(): return f"{str(c)}:app"
        return f"{str(p / 'app.py')}:app"
    local = cwd / arg
    if local.exists() and local.is_dir():
        for fname in _CANDIDATE_FILES:
            c = local / fname
            if c.exists(): return f"{str(c)}:app"
        return f"{str(local / 'app.py')}:app"
    return f"{arg}:app"

def _load(target: str):
    mod_part, obj = target.split(":", 1)
    # File path target? ensure sibling imports work (no __init__.py required)
    if mod_part.lower().endswith(".py") or mod_part.replace("\\","/").lower().endswith(".py"):
        path = Path(mod_part).resolve()
        if not path.exists(): raise SystemExit(f"[brx] File not found: {path}")
        sys.path.insert(0, str(path.parent))  # <-- key: add script dir to import path
        spec = importlib.util.spec_from_loader(
            path.stem, importlib.machinery.SourceFileLoader(path.stem, str(path))
        )
        if spec is None or spec.loader is None:
            raise SystemExit(f"[brx] Could not load module from: {path}")
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)  # type: ignore
        if hasattr(mod, obj): return getattr(mod, obj)
        for name in _CANDIDATE_OBJS:
            if hasattr(mod, name): return getattr(mod, name)
        raise SystemExit(f"[brx] '{obj}' not found in {path.name}. Tried: {obj}, {', '.join(_CANDIDATE_OBJS)}")
    mod = importlib.import_module(mod_part)
    if hasattr(mod, obj): return getattr(mod, obj)
    raise SystemExit(f"[brx] '{obj}' not found in module {mod_part}")

def _serve(target: str, mode: str = "dev", host: str = "127.0.0.1", port: int = 8000):
    try:
        import uvicorn
    except Exception as e:
        raise SystemExit("[brx] uvicorn is required. Install with: pip install 'brackets[speed]'") from e
    app = _load(target)
    log_level = "warning" if mode == "prod" else "info"
    uvicorn.run(app, host=host, port=port, log_level=log_level)

def main(argv: list[str] | None = None):
    argv = argv or sys.argv[1:]
    p = argparse.ArgumentParser("brx")
    sub = p.add_subparsers(dest="cmd", required=True)
    dev = sub.add_parser("dev", help="Start dev server (short targets allowed: 'app')")
    dev.add_argument("target", nargs="?", help="'app', 'app/app.py', 'file.py:app', or 'pkg.mod:app'")
    dev.add_argument("--host", default="127.0.0.1"); dev.add_argument("--port", default=8000, type=int)
    srv = sub.add_parser("serve", help="Start production server")
    srv.add_argument("target", nargs="?"); srv.add_argument("--host", default="0.0.0.0"); srv.add_argument("--port", default=8000, type=int)
    a = p.parse_args(argv); from pathlib import Path; cwd = Path(os.getcwd())
    if a.cmd == "dev": _serve(_resolve_target(a.target, cwd), mode="dev", host=a.host, port=a.port); return 0
    if a.cmd == "serve": _serve(_resolve_target(a.target, cwd), mode="prod", host=a.host, port=a.port); return 0
    p.print_help(); return 1

if __name__ == "__main__": import sys; sys.exit(main())
