from fastapi import APIRouter
from typing import Callable, Any

_registry: list[tuple[str,str,Callable[...,Any]]] = []

def _add(method: str, path: str, fn: Callable[...,Any]):
    _registry.append((method.upper(), path, fn))
    return fn

def get(path: str):
    def deco(fn): return _add('GET', path, fn)
    return deco

def post(path: str):
    def deco(fn): return _add('POST', path, fn)
    return deco

def put(path: str):
    def deco(fn): return _add('PUT', path, fn)
    return deco

def delete(path: str):
    def deco(fn): return _add('DELETE', path, fn)
    return deco

def mount_decorators(app):
    router = APIRouter()
    for method, path, fn in _registry:
        router.add_api_route(path, fn, methods=[method])
    app.include_router(router)
