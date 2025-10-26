from pathlib import Path
from brackets import App, get, page

app = App(templates=str(Path(__file__).parent / 'templates'))

@get('/')
def home():
    return page('pages/index.bx', title='Brackets', _app=app)
