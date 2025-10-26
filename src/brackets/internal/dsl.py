
import re, pathlib

FOR_RE = re.compile(r'\[for\s+([^\]\s]+)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?(?:\s+key\s+([^\]\s]+))?(?:\s+when\s+([^\]]+))?\]')
EMPTY_RE = re.compile(r'\[empty\]')
BETWEEN_RE = re.compile(r'\[between\]')
ENDFOR_RE = re.compile(r'\[/for\]')

def _to_jinja_braces(s: str) -> str:
    # Replace {expr} with {{ expr }} but leave {{ }} untouched
    s = re.sub(r'\{([^{}\n][^{}]*)\}', r'{{ \1 }}', s)
    return s

def compile_bx(source: str) -> str:
    # Convert loop sugar and braces
    out = []
    i = 0
    stack = []
    while i < len(source):
        m = FOR_RE.search(source, i)
        if not m:
            out.append(_to_jinja_braces(source[i:]))
            break
        # text before
        out.append(_to_jinja_braces(source[i:m.start()]))
        iterable, alias, keyexpr, whenexpr = m.groups()
        alias = alias or '__it'
        cond = f' if {whenexpr}' if whenexpr else ''
        out.append(f'{{% for {alias} in ({iterable} or []){cond} %}}')
        # expose dot shorthand by replacing '{.' with '{{ alias.' later in slice
        # We'll handle within block by pushing alias onto stack
        stack.append(alias)
        # find block end
        j = m.end()
        # search for [empty], [between], [/for]
        parts = []
        last = j
        empty_pos = None
        between_pos = []
        while True:
            m_empty = EMPTY_RE.search(source, last)
            m_between = BETWEEN_RE.search(source, last)
            m_end = ENDFOR_RE.search(source, last)
            next_pos = min([p.start() for p in [m_empty, m_between, m_end] if p] or [len(source)])
            # body segment
            body = source[last:next_pos]
            # dot replacements for this level
            body = body.replace('{.', '{{ '+alias+'.')
            out.append(_to_jinja_braces(body))
            if m_end and m_end.start() == next_pos:
                out.append('{% endfor %}')
                i = m_end.end()
                stack.pop()
                break
            elif m_empty and m_empty.start() == next_pos:
                out.append('{% else %}')
                last = m_empty.end()
            elif m_between and m_between.start() == next_pos:
                out.append('{% if not loop.last %}')
                # content after [between]
                k = m_between.end()
                m_between_end = FOR_RE.search(source, k)  # not used; we'll close on next marker
                # parse until next marker or end/empty
                # We'll consume until next marker in next loop iteration
                last = k
                # close will be emitted when marker encountered
                # We close the if after adding the between segment text on next loop
                # Add a sentinel to close after appending text chunk
                # Simplify: close immediately with empty content is ok
                # We'll handle by injecting endif when we hit another marker or end
                # For simplicity, inject an endif marker right away and let user include content inline
                # Better: We'll read next segment until a marker.
                # Implement quick read:
                m_next = min([x for x in [EMPTY_RE.search(source, last), BETWEEN_RE.search(source, last), ENDFOR_RE.search(source, last)] if x], key=lambda x:x.start())
                seg = source[last:m_next.start()]
                seg = seg.replace('{.', '{{ '+alias+'.')
                out.append(_to_jinja_braces(seg))
                out.append('{% endif %}')
                last = m_next.start()
            else:
                # should not happen
                i = next_pos
                break
    return ''.join(out)

def bx(template: str | None = None):
    class _Bx:
        @staticmethod
        def compile(src: str) -> str:
            return compile_bx(src)
        @staticmethod
        def file(path: str) -> str:
            p = pathlib.Path(path)
            return compile_bx(p.read_text(encoding='utf-8'))
        @staticmethod
        def lines(*lines: str) -> str:
            return compile_bx('\n'.join(lines))
    if template is None:
        return _Bx
    return compile_bx(template)
