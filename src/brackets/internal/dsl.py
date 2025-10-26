# Compiler for .bx templates (React-ish → Jinja + hidden HTMX attrs)
import re, html, pathlib

def _to_jinja_braces(s: str) -> str:
    return re.sub(r'\{([^{}\n][^{}]*)\}', r'{{ \1 }}', s)

FOR_RE = re.compile(r'\[for\s+([^\]\s]+)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?(?:\s+key\s+([^\]\s]+))?(?:\s+when\s+([^\]]+))?\]')
EMPTY_RE = re.compile(r'\[empty\]')
BETWEEN_RE = re.compile(r'\[between\]')
ENDFOR_RE = re.compile(r'\[/for\]')

def _compile_loops_and_braces(source: str) -> str:
    out, i = [], 0
    while i < len(source):
        m = FOR_RE.search(source, i)
        if not m:
            out.append(_to_jinja_braces(source[i:])); break
        out.append(_to_jinja_braces(source[i:m.start()]))
        iterable, alias, keyexpr, whenexpr = m.groups()
        alias = alias or '__it'
        cond = f' if {whenexpr}' if whenexpr else ''
        out.append(f'{{% for {alias} in ({iterable} or []){cond} %}}')
        last = m.end()
        while True:
            m_empty = EMPTY_RE.search(source, last)
            m_between = BETWEEN_RE.search(source, last)
            m_end = ENDFOR_RE.search(source, last)
            next_pos = min([p.start() for p in [m_empty, m_between, m_end] if p] or [len(source)])
            seg = source[last:next_pos].replace('{.', '{{ '+alias+'.')
            out.append(_to_jinja_braces(seg))
            if m_end and m_end.start() == next_pos:
                out.append('{% endfor %}'); i = m_end.end(); break
            elif m_empty and m_empty.start() == next_pos:
                out.append('{% else %}'); last = m_empty.end()
            elif m_between and m_between.start() == next_pos:
                k = m_between.end()
                nxt = min([x for x in [EMPTY_RE.search(source, k), BETWEEN_RE.search(source, k), ENDFOR_RE.search(source, k)] if x], key=lambda x:x.start())
                mid = source[k:nxt.start()].replace('{.', '{{ '+alias+'.')
                out.append('{% if not loop.last %}'); out.append(_to_jinja_braces(mid)); out.append('{% endif %}')
                last = nxt.start()
            else:
                i = next_pos; break
    return ''.join(out)

ATTR_RE = re.compile(r'([A-Za-z_:][-\w:]*)(?:="([^"]*)")?')
LINK_OPEN_RE = re.compile(r'<Link\b([^>]*)>', re.I | re.S)
LINK_CLOSE_RE = re.compile(r'</Link\s*>', re.I)
ROUTEVIEW_RE = re.compile(r'<RouteView\b([^>]*)/?>', re.I)

def _parse_attrs(attr_text: str) -> dict:
    attrs = {}
    for k, v in ATTR_RE.findall(attr_text or ''):
        attrs[k] = True if v == '' else v
    return attrs

def _attrs_to_html(attrs: dict) -> str:
    parts = []
    for k, v in attrs.items():
        parts.append(k if v is True else f'{k}="{html.escape(str(v), True)}"')
    return (' ' + ' '.join(parts)) if parts else ''

def _transform_routeview(s: str) -> str:
    def repl(m):
        attrs = _parse_attrs(m.group(1)); rid = attrs.get('id','app')
        extra = {k:v for k,v in attrs.items() if k.lower()!='id'}
        out = {'id': rid, 'data-bx-routeview': '1', 'hx-swap-oob': 'true', **extra}
        return f'<div{_attrs_to_html(out)}></div>'
    return ROUTEVIEW_RE.sub(repl, s)

def _transform_links(html_in: str, default_target='#app') -> str:
    def repl_link(m):
        raw = m.group(1); close = LINK_CLOSE_RE.search(html_in, m.end())
        inner = '' if not close else html_in[m.end():close.start()]
        attrs = _parse_attrs(raw)
        to = attrs.pop('to', None) or attrs.get('href') or '/'
        prefetch = bool(attrs.pop('prefetch', False))
        out_attrs = {'href': to, 'hx-get': to, 'hx-target': default_target, 'hx-push-url': 'true', 'data-bx-link': '1'}
        if prefetch: out_attrs['data-bx-prefetch'] = '1'
        for k,v in list(attrs.items()):
            if k.lower() not in ('to','prefetch'): out_attrs[k]=v
        return f'<a{_attrs_to_html(out_attrs)}>{inner}</a>'
    out, i = [], 0
    while True:
        m = LINK_OPEN_RE.search(html_in, i)
        if not m: out.append(html_in[i:]); break
        out.append(html_in[i:m.start()])
        close = LINK_CLOSE_RE.search(html_in, m.end())
        out.append(repl_link(m))
        i = (close.end() if close else m.end())
    return ''.join(out)

def _transform_forms_buttons(s: str, default_target='#app') -> str:
    def form_repl(match):
        tag = match.group(0)
        if not re.search(r'\\bonSubmit\\b|\\bonsubmit\\b', tag): return tag
        mact = re.search(r'action="([^"]*)"', tag)
        tag2 = re.sub(r'\\s(onSubmit|onsubmit)=(\\{[^}]*\\}|"[^"]*")', '', tag)
        inject = []
        if mact: inject.append(f'hx-post="{html.escape(mact.group(1), True)}"')
        else: inject.append('hx-boost="true"')
        inject += [f'hx-target="{default_target}"', 'hx-push-url="true"']
        return re.sub(r'>$',' ' + ' '.join(inject) + '>', tag2)
    s = re.sub(r'<form\\b[^>]*>', form_repl, s, flags=re.I)
    def btn_repl(match):
        tag = match.group(0)
        if not re.search(r'\\bonClick\\b|\\bonclick\\b', tag): return tag
        mact = re.search(r'data-action="([^"]+)"', tag)
        if not mact: return tag
        tag2 = re.sub(r'\\s(onClick|onclick)=(\\{[^}]*\\}|"[^"]*")', '', tag)
        inject = f' hx-post="{html.escape(mact.group(1), True)}" hx-target="{default_target}" hx-push-url="true"'
        return tag2[:-1] + inject + '>'
    s = re.sub(r'<button\\b[^>]*>', btn_repl, s, flags=re.I)
    return s

def compile_bx(source: str) -> str:
    s = _compile_loops_and_braces(source)
    s = _transform_routeview(s)
    s = _transform_links(s)
    s = _transform_forms_buttons(s)
    return s

class bx:
    @staticmethod
    def compile(src: str) -> str: return compile_bx(src)
    @staticmethod
    def file(path: str) -> str:
        p = pathlib.Path(path)
        return compile_bx(p.read_text(encoding='utf-8'))
    @staticmethod
    def lines(*lines: str) -> str:
        return compile_bx('\\n'.join(lines))
