from __future__ import annotations
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from importlib.resources import files as pkg_files
from .render import Env
from .router import mount_decorators
from .security import CSRFMiddleware
from .sse import mount_sse
from .events import mount_events

class App(FastAPI):
    """FastAPI with Brackets wiring: static, Jinja env, CSRF, sessions, SSE, events."""
    def __init__(self, templates: str | None = None, *, secret: str = 'dev-secret', morph: bool = False):
        super().__init__()
        self.env = Env(templates_dir=templates)
        static_dir = pkg_files('brackets').joinpath('static')
        self.mount('/static', StaticFiles(directory=str(static_dir)), name='static')
        self.add_middleware(SessionMiddleware, secret_key=secret)
        self.add_middleware(CSRFMiddleware)
        mount_sse(self)
        mount_events(self)
        mount_decorators(self)

    def render(self, template: str, **ctx):
        return self.env.render(template, **ctx)

def openWindow(app: App, *, title: str = 'Brackets', width: int = 1200, height: int = 800):
    import threading, socket, time
    import webview
    import uvicorn

    def free_port(start=12701):
        with socket.socket() as s:
            for p in range(start, start+200):
                try:
                    s.bind(('127.0.0.1', p)); return p
                except OSError:
                    continue
        raise RuntimeError('No free port')

    port = free_port()
    thread = threading.Thread(
        target=lambda: uvicorn.run(app, host='127.0.0.1', port=port, log_level='warning'),
        daemon=True
    )
    thread.start(); time.sleep(0.4)
    webview.create_window(title, f'http://127.0.0.1:{port}', width=width, height=height)
    webview.start()
