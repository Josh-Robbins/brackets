from __future__ import annotations
from typing import Any
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

def page(template: str | None = None, /, **ctx: Any):
    """Render a template via app.env.
    Usage: return page('pages/index.bx', title='Welcome', _app=app)
    """
    app = ctx.pop('_app', None)
    if app is None:
        for v in ctx.values():
            if hasattr(v, 'env'):
                app = v; break
        if app is None:
            raise RuntimeError("page(...) requires _app=app or an object with .env")
    html = app.render(template, **ctx)
    return HTMLResponse(html)

def json(data: Any, **opts):
    return JSONResponse(data, **opts)

def redirect(to: str):
    return RedirectResponse(to, status_code=303)

def toast(message: str):
    return JSONResponse({"brx": {"toast": message}})

def reload():
    return JSONResponse({"brx": {"reload": True}})
