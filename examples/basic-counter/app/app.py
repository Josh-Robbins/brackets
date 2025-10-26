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
