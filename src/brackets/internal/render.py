from jinja2 import Environment, FileSystemLoader, select_autoescape, BaseLoader
from .dsl import compile_bx

class Jinja:
    def __init__(self, templates_dir: str):
        self.env = Environment(
            loader=FileSystemLoader(templates_dir),
            autoescape=select_autoescape(['html','xml','bx']),
            enable_async=False,
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def render(self, template: str | None, **ctx) -> str:
        if not template:
            return ''
        if template.endswith('.bx'):
            # Precompile .bx to Jinja text, then render from a string
            raw = self.env.loader.get_source(self.env, template)[0]
            compiled = compile_bx(raw)
            tpl = self.env.from_string(compiled)
            return tpl.render(**ctx)
        tpl = self.env.get_template(template)
        return tpl.render(**ctx)
