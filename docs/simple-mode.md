# Simple Mode — 90‑second start

This is the smallest working app:

```python
from pathlib import Path
from fastapi import Request
from brackets import App, get, post, page

app = App(templates=str(Path(__file__).parent / 'templates'))

@get('/')
def home(request: Request):
    n = int(request.session.get('n', 0))
    return page('pages/index.bx', n=n, _app=app)

@post('/inc')
def increment(request: Request):
    n = int(request.session.get('n', 0)) + 1
    request.session['n'] = n
    return page('pages/index.bx', n=n, _app=app)
```

**templates/layouts/@base.bx**

```html
<!doctype html>
<html>
  <head>
    <script src="/static/vendor/htmx.min.js"></script>
    <script src="/static/brackets.js"></script>
  </head>
  <body><main id="app">{children}</main></body>
</html>
```

**templates/pages/index.bx**

```html
<h1>Counter</h1>
<p>Value: <strong>{n}</strong></p>
<form action="/inc" onSubmit>
  <button type="submit">+1</button>
</form>
```

Run:

```bash
brx dev app.app:app
```
