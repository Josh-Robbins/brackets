from __future__ import annotations
from typing import Callable, Any, Optional
from time import time
from functools import wraps

_backend = None

def useCache(url: str | None):
    global _backend
    if url is None or url == 'auto':
        try:
            import redis  # type: ignore
            _backend = RedisCache('redis://127.0.0.1:6379/0')
        except Exception:
            _backend = MemoryCache()
    elif isinstance(url, str) and url.startswith('redis://'):
        _backend = RedisCache(url)
    else:
        _backend = MemoryCache()

class CacheBackend:
    def get(self, key: str): ...
    def set(self, key: str, value: Any, ttl: int, tags: list[str] | None = None): ...
    def invalidate(self, key: str | None = None, tags: list[str] | None = None): ...

class MemoryCache(CacheBackend):
    def __init__(self):
        self.store = {}
        self.tags = {}
    def get(self, key: str):
        item = self.store.get(key)
        if not item: return None
        exp, val = item
        if exp and exp < time(): self.store.pop(key, None); return None
        return val
    def set(self, key: str, value: Any, ttl: int, tags: list[str] | None = None):
        self.store[key] = (time()+ttl if ttl else 0, value)
        for t in (tags or []): self.tags.setdefault(t, set()).add(key)
    def invalidate(self, key: str | None = None, tags: list[str] | None = None):
        if key: self.store.pop(key, None)
        for t in (tags or []):
            for k in self.tags.get(t, set()): self.store.pop(k, None)
            self.tags.pop(t, None)

class RedisCache(CacheBackend):
    def __init__(self, url: str):
        import redis  # type: ignore
        self.r = redis.from_url(url, decode_responses=True)
        self.prefix = 'brx:'
    def _k(self, k: str): return self.prefix + k
    def get(self, key: str):
        return self.r.get(self._k(key))
    def set(self, key: str, value: Any, ttl: int, tags: list[str] | None = None):
        p = self.r.pipeline(True)
        p.set(self._k(key), value, ex=ttl if ttl else None)
        for t in (tags or []): p.sadd(self._k('tag:'+t), key)
        p.execute()
    def invalidate(self, key: str | None = None, tags: list[str] | None = None):
        if key: self.r.delete(self._k(key))
        for t in (tags or []):
            tagk = self._k('tag:'+t)
            members = self.r.smembers(tagk)
            if members: self.r.delete(*[self._k(m) for m in members])
            self.r.delete(tagk)

def cache(seconds: int = 60, *, key: str | None = None, tags: list[str] | None = None, vary: list[str] | None = None, stale: int | None = None):
    def deco(fn: Callable[..., Any]):
        @wraps(fn)
        def wrapper(*a, **kw):
            be = _backend or MemoryCache()
            k = key or f"{fn.__name__}:{a}:{kw}"
            v = be.get(k)
            if v is not None: return v
            v = fn(*a, **kw)
            be.set(k, v, seconds, tags)
            return v
        return wrapper
    return deco

def invalidate(*, key: str | None = None, tags: list[str] | None = None):
    be = _backend or MemoryCache()
    be.invalidate(key=key, tags=tags)
