from __future__ import annotations
import time, hashlib, threading
from typing import Callable, Any, Optional, Dict, Tuple, List

try:
    import redis  # type: ignore
except Exception:
    redis = None

_backend = {"mode": "auto", "client": None}
_mem_store: Dict[str, Tuple[float, Any]] = {}
_tag_index: Dict[str, set[str]] = {}
_lock = threading.RLock()

def useCache(mode: str):
    global _backend
    if mode == "auto":
        if redis is not None:
            _backend = {"mode": "redis", "client": redis.Redis.from_url("redis://127.0.0.1:6379/0")}
        else:
            _backend = {"mode": "memory", "client": None}
    elif mode.startswith("redis://"):
        if redis is None:
            raise RuntimeError("redis extra not installed; pip install brackets[cache]")
        _backend = {"mode": "redis", "client": redis.Redis.from_url(mode)}
    else:
        _backend = {"mode": "memory", "client": None}
    return _backend["mode"]

def _now(): return time.time()

def _make_key(route_key: Optional[str], fn: Callable, args: tuple, kwargs: dict) -> str:
    if route_key:
        return route_key
    raw = (fn.__module__, fn.__qualname__, args, tuple(sorted(kwargs.items())))
    return hashlib.sha256(repr(raw).encode()).hexdigest()

def _get(key: str):
    if _backend["mode"] == "redis" and _backend["client"] is not None:
        v = _backend["client"].get(f"brx:{key}")
        if v is None: return None, None
        ts = float(_backend["client"].get(f"brx:{key}:ts") or b"0")
        return ts, v
    with _lock:
        item = _mem_store.get(key)
        if not item: return None, None
        return item

def _set(key: str, value: Any, ttl: int, tags: Optional[List[str]]):
    exp = _now() + ttl if ttl > 0 else float("inf")
    if _backend["mode"] == "redis" and _backend["client"] is not None:
        cli = _backend["client"]
        pipe = cli.pipeline()
        pipe.set(f"brx:{key}", value)
        pipe.set(f"brx:{key}:ts", exp)
        if ttl > 0: pipe.expire(f"brx:{key}", ttl); pipe.expire(f"brx:{key}:ts", ttl)
        if tags:
            for t in tags:
                pipe.sadd(f"brx:tag:{t}", key)
        pipe.execute()
    else:
        with _lock:
            _mem_store[key] = (exp, value)
            if tags:
                for t in tags:
                    _tag_index.setdefault(t, set()).add(key)

def invalidate(*, key: Optional[str] = None, tags: Optional[List[str]] = None):
    if _backend["mode"] == "redis" and _backend["client"] is not None:
        cli = _backend["client"]
        if key:
            cli.delete(f"brx:{key}", f"brx:{key}:ts")
        if tags:
            for t in tags:
                members = cli.smembers(f"brx:tag:{t}")
                if members:
                    cli.delete(*[f"brx:{m.decode()}" for m in members])
                    cli.delete(*[f"brx:{m.decode()}:ts" for m in members])
                cli.delete(f"brx:tag:{t}")
    else:
        with _lock:
            if key and key in _mem_store: _mem_store.pop(key, None)
            if tags:
                for t in tags:
                    for k in list(_tag_index.get(t, set())):
                        _mem_store.pop(k, None)
                    _tag_index.pop(t, None)

def cache(seconds: int = 60, *, key: Optional[str] = None, vary: Optional[list[str]] = None,
          stale: Optional[int] = None, tags: Optional[List[str]] = None, storage: Optional[str] = None):
    if storage:
        useCache(storage)
    def deco(fn: Callable):
        def wrapper(*args, **kwargs):
            resolved_key = key
            if key and "{" in key and "}" in key:
                try:
                    resolved_key = key.format(**kwargs)
                except Exception:
                    resolved_key = key
            k = _make_key(resolved_key, fn, args, kwargs)
            ts, value = _get(k)
            now = _now()
            if ts is not None and ts > now:
                return value
            value = fn(*args, **kwargs)
            _set(k, value, seconds, tags)
            return value
        wrapper.__name__ = fn.__name__
        wrapper.__doc__ = fn.__doc__
        return wrapper
    return deco
