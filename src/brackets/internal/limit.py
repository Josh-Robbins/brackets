import time
from fastapi import Request, HTTPException
from functools import wraps

_buckets = {}

def limit(spec: str):
    # '60/m' -> (60, 60) requests per 60s
    count, per = spec.split('/')
    n = int(count)
    window = {'s':1,'m':60,'h':3600}[per]
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            req: Request = kw.get('request') or (a[0] if a and hasattr(a[0],'headers') else None)
            ip = req.client.host if req else 'anon'
            now = int(time.time()/window)
            key = (ip, fn.__name__, now)
            c = _buckets.get(key, 0) + 1
            _buckets[key] = c
            if c > n:
                raise HTTPException(status_code=429, detail='Too many requests')
            return fn(*a, **kw)
        return wrapper
    return deco
