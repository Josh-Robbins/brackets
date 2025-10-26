from __future__ import annotations
from typing import Callable, Any
from fastapi import FastAPI

_REGISTRY: list[tuple[str,str,Callable[...,Any]]] = []

def _reg(method: str, path: str, func: Callable[...,Any]):
    _REGISTRY.append((method.upper(), path, func)); return func

def get(path: str):
    return lambda f: _reg('GET', path, f)

def post(path: str):
    return lambda f: _reg('POST', path, f)

def put(path: str):
    return lambda f: _reg('PUT', path, f)

def delete(path: str):
    return lambda f: _reg('DELETE', path, f)

def mount_decorators(app: FastAPI):
    for method, path, func in list(_REGISTRY):
        app.add_api_route(path, func, methods=[method])
