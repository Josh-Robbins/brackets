# Quickstart (90 seconds)

```python
# app/app.py
from pathlib import Path
from brackets import App, get, page
app = App(templates=str(Path(__file__).parent / 'templates'))

@get('/')
def home():
    return page('pages/index.bx', title='Welcome', _app=app)
```
Run:
```
brx dev app.app:app
```
