from pathlib import Path
from brackets import App, get, page, openWindow

app = App(templates=str(Path(__file__).parent / 'templates'))

@get('/')
def home():
    return page('pages/index.bx', title='Desktop Demo', _app=app)

if __name__ == "__main__":
    openWindow(app, title='Brackets Desktop', width=1200, height=800)