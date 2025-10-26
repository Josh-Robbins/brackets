from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .render import Jinja
from .router import mount_decorators

class App(FastAPI):
    def __init__(self, templates: str | None = None, prefix: str = "/bx"):
        super().__init__()
        self.jinja = Jinja(templates_dir=templates or "templates")
        static_root = __import__('pathlib').Path(__file__).parent.parent / 'static'
        self.mount('/static', StaticFiles(directory=str(static_root)), name='static')
        mount_decorators(self)
    def render(self, template: str | None, **ctx) -> str:
        return self.jinja.render(template, **ctx)
