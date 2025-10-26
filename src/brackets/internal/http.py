from fastapi.responses import HTMLResponse, JSONResponse
BRX = 'brx'
def page(view: str | None = None, /, **ctx) -> HTMLResponse:
    app = ctx.pop('_app', None)
    if app is None:
        # allow direct HTML
        html = ctx.pop('__html', None)
        if html is None:
            raise RuntimeError('page() needs _app=App or __html HTML string')
        return HTMLResponse(html)
    html = app.render(view, **ctx)
    return HTMLResponse(html)
json = JSONResponse
def redirect(to: str): return JSONResponse({BRX: {'redirect': to}})
def toast(msg: str): return JSONResponse({BRX: {'toast': msg}})
def reload(): return JSONResponse({BRX: {'reload': True}})
