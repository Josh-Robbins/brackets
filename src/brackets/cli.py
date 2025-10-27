from __future__ import annotations
import argparse, sys, os
from pathlib import Path
import importlib, importlib.util, importlib.machinery

# tomllib on 3.11+, tomli fallback on 3.10
try:
    import tomllib  # Python 3.11+
except Exception:
    try:
        import tomli as tomllib  # backport
    except Exception:
        tomllib = None  # type: ignore

# Recognized filenames / objects when resolving short targets
_CANDIDATE_FILES = ("app.py", "server.py", "main.py", "application.py", "api.py")
_CANDIDATE_OBJS  = ("app", "api", "application", "asgi")

# ---------- config / target resolution ----------

def _read_default_target(cwd: Path) -> str | None:
    """Read defaultTarget from brx.toml (top-level or [brx])."""
    p = cwd / "brx.toml"
    if not p.exists() or tomllib is None:
        return None
    try:
        data = tomllib.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            if "defaultTarget" in data:
                return str(data["defaultTarget"])
            brx = data.get("brx")
            if isinstance(brx, dict) and "defaultTarget" in brx:
                return str(brx["defaultTarget"])
    except Exception:
        pass
    return None

def _resolve_target(arg: str | None, cwd: Path) -> str:
    """
    Accepts:
      - None                        -> uses brx.toml defaultTarget or 'app'
      - 'app'                       -> app/app.py:app
      - 'dir' or '.\\dir'           -> dir/<candidate>.py:app
      - 'file.py'                   -> file.py:app
      - 'file.py:obj'               -> unchanged
      - 'pkg.mod:obj'               -> unchanged
    """
    if not arg:
        arg = _read_default_target(cwd) or "app"

    if ":" in arg:
        return arg

    p = Path(arg)
    # file target (relative or absolute)
    if p.suffix.lower() == ".py":
        return f"{arg}:app"

    # directory target
    if p.exists() and p.is_dir():
        for fname in _CANDIDATE_FILES:
            cand = p / fname
            if cand.exists():
                return f"{str(cand)}:app"
        return f"{str(p / 'app.py')}:app"

    # bare word that matches a local directory
    local = cwd / arg
    if local.exists() and local.is_dir():
        for fname in _CANDIDATE_FILES:
            cand = local / fname
            if cand.exists():
                return f"{str(cand)}:app"
        return f"{str(local / 'app.py')}:app"

    # treat as module path; assume :app
    return f"{arg}:app"

# ---------- loader / runner ----------

def _load(target: str):
    """Load 'file.py:obj' (no package needed) or 'pkg.mod:obj'."""
    mod_part, obj = target.split(":", 1)

    # File path target: allow sibling imports with no __init__.py
    if mod_part.lower().endswith(".py") or mod_part.replace("\\", "/").lower().endswith(".py"):
        path = Path(mod_part).resolve()
        if not path.exists():
            raise SystemExit(f"[brx] File not found: {path}")
        # Add the file's folder to sys.path so 'from models import X' works
        if str(path.parent) not in sys.path:
            sys.path.insert(0, str(path.parent))

        spec = importlib.util.spec_from_loader(
            path.stem, importlib.machinery.SourceFileLoader(path.stem, str(path))
        )
        if spec is None or spec.loader is None:
            raise SystemExit(f"[brx] Could not load module from: {path}")

        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[attr-defined]

        if hasattr(mod, obj):
            return getattr(mod, obj)
        # Try alternates if user omitted or misnamed
        for name in _CANDIDATE_OBJS:
            if hasattr(mod, name):
                return getattr(mod, name)
        raise SystemExit(
            f"[brx] '{obj}' not found in {path.name}. "
            f"Tried: {obj}, {', '.join(_CANDIDATE_OBJS)}"
        )

    # Import string target
    mod = importlib.import_module(mod_part)
    if hasattr(mod, obj):
        return getattr(mod, obj)
    raise SystemExit(f"[brx] '{obj}' not found in module {mod_part}")

def _serve(target: str, mode: str = "dev", host: str = "127.0.0.1", port: int = 8000):
    try:
        import uvicorn  # provided by brackets[speed]
    except Exception as e:
        raise SystemExit("[brx] uvicorn is required. Install with: pip install 'uvicorn[standard]'") from e

    app = _load(target)
    log_level = "warning" if mode == "prod" else "info"
    # We pass the app object directly; uvicorn 'reload' requires import strings.
    uvicorn.run(app, host=host, port=port, log_level=log_level)

# ---------- CLI ----------

def main(argv: list[str] | None = None):
    argv = argv or sys.argv[1:]
    p = argparse.ArgumentParser("brx")
    sub = p.add_subparsers(dest="cmd", required=True)

    dev = sub.add_parser("dev", help="Start dev server (short targets allowed: 'app')")
    dev.add_argument("target", nargs="?", help="'app', 'dir', 'file.py', 'file.py:obj', or 'pkg.mod:obj'")
    dev.add_argument("--host", default="127.0.0.1")
    dev.add_argument("--port", default=8000, type=int)

    srv = sub.add_parser("serve", help="Start production server")
    srv.add_argument("target", nargs="?", help="Same resolution as 'dev'")
    srv.add_argument("--host", default="0.0.0.0")
    srv.add_argument("--port", default=8000, type=int)

    a = p.parse_args(argv)
    cwd = Path(os.getcwd())

    if a.cmd == "dev":
        _serve(_resolve_target(a.target, cwd), mode="dev", host=a.host, port=a.port)
        return 0
    if a.cmd == "serve":
        _serve(_resolve_target(a.target, cwd), mode="prod", host=a.host, port=a.port)
        return 0

    p.print_help()
    return 1

if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
