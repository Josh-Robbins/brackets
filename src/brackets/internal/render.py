from __future__ import annotations
import hashlib, os
from typing import Any
from jinja2 import Environment, FileSystemLoader, Template
from .dsl import compile_bx

class Env:
    def __init__(self, templates_dir: str | None = None):
        self.templates_dir = templates_dir or os.getcwd()
        self.jinja = Environment(loader=FileSystemLoader(self.templates_dir), autoescape=True)

    def render(self, template: str, **ctx: Any) -> str:
        path = os.path.join(self.templates_dir, template)
        with open(path, 'r', encoding='utf-8') as f:
            src = f.read()
        compiled = compile_bx(src)
        tpl: Template = self.jinja.from_string(compiled)
        html = tpl.render(**ctx)
        return html

    @staticmethod
    def etag_for(html: str) -> str:
        return hashlib.sha256(html.encode('utf-8')).hexdigest()
